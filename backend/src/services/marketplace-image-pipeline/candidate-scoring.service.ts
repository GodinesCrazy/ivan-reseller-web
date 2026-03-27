import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import type { ImageCandidateScoreBreakdown, ScoredImageCandidate } from './types';
import { getMercadoLibreChilePolicyProfile } from './policy-profiles';

const DETAIL_SLOT_KEY = 'scdf80a1900764667b3e4c3b600f79325u';

export function extractAeImageObjectKey(u: string): string | null {
  const m = u.trim().match(/\/kf\/(S[a-zA-Z0-9]+)\./i);
  return m ? m[1]!.toLowerCase() : null;
}

function parseProductMetadataForSupplements(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' ? p : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
}

/** Optional https URLs prepended for canonical enumeration (P78 / operator-supplied clean heroes). */
export function mergeCanonicalSupplementUrls(urls: string[], productData?: unknown): string[] {
  const m = parseProductMetadataForSupplements(productData);
  const raw = m.mlImagePipeline?.canonicalSupplementUrls;
  if (!Array.isArray(raw)) return urls;
  const sup = raw.filter((x): x is string => typeof x === 'string' && x.trim().toLowerCase().startsWith('http'));
  return [...sup, ...urls];
}

function defaultWorkspaceRootForPortada(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'backend')) && fs.existsSync(path.join(cwd, 'docs'))) {
    return cwd;
  }
  if (fs.existsSync(path.join(cwd, 'src')) && fs.existsSync(path.join(cwd, 'package.json'))) {
    return path.resolve(cwd, '..');
  }
  return path.resolve(cwd, '..');
}

/** P105 — single highest-priority portada source (same product, clean hero). Must be http(s). */
export function parsePortadaSupplementHeroUrl(productData: unknown): string | null {
  const m = parseProductMetadataForSupplements(productData);
  const u = m.mlImagePipeline?.portadaSupplementHeroUrl;
  if (typeof u !== 'string') return null;
  const t = u.trim();
  const lower = t.toLowerCase();
  if (!lower.startsWith('https://') && !lower.startsWith('http://')) return null;
  return t;
}

/**
 * P105 — supplement hero as a file under the monorepo (no public URL required).
 * Path is relative to workspace root; must stay under that root (no traversal).
 */
export function parsePortadaSupplementHeroWorkspacePath(
  productData: unknown,
  workspaceRoot?: string
): { absolute: string; display: string } | null {
  const m = parseProductMetadataForSupplements(productData);
  const rel = m.mlImagePipeline?.portadaSupplementHeroWorkspaceRelativePath;
  if (typeof rel !== 'string' || !rel.trim()) return null;
  const rootResolved = path.resolve(workspaceRoot ?? defaultWorkspaceRootForPortada());
  const abs = path.resolve(rootResolved, rel.trim());
  const relToRoot = path.relative(rootResolved, abs);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    return null;
  }
  return { absolute: abs, display: rel.trim() };
}

export type PortadaRebuildSourceKind = 'portada_supplement_hero' | 'canonical_supplement' | 'supplier';

export interface PortadaRebuildSourceCandidate {
  url: string;
  objectKey: string | null;
  sourceKind: PortadaRebuildSourceKind;
  /** When set, load bytes from disk instead of HTTP. */
  workspaceAbsolutePath?: string;
}

/**
 * P105 — Deterministic portada rebuild / canonical URL order:
 * 1) mlImagePipeline.portadaSupplementHeroUrl
 * 2) mlImagePipeline.canonicalSupplementUrls[]
 * 3) supplier AliExpress (and other) URLs via enumerateMainCandidates (deduped)
 */
export function buildPortadaRebuildCandidateList(
  supplierImageUrls: string[],
  productData?: unknown,
  workspaceRoot?: string
): PortadaRebuildSourceCandidate[] {
  const root = workspaceRoot ?? defaultWorkspaceRootForPortada();
  const out: PortadaRebuildSourceCandidate[] = [];
  const seen = new Set<string>();

  const heroUrl = parsePortadaSupplementHeroUrl(productData);
  const heroWs = parsePortadaSupplementHeroWorkspacePath(productData, root);

  if (heroUrl) {
    out.push({ url: heroUrl, objectKey: 'portada_supplement_hero', sourceKind: 'portada_supplement_hero' });
    seen.add(heroUrl);
  } else if (heroWs) {
    out.push({
      url: `workspace:${heroWs.display}`,
      objectKey: 'portada_supplement_hero',
      sourceKind: 'portada_supplement_hero',
      workspaceAbsolutePath: heroWs.absolute,
    });
    seen.add(heroWs.absolute);
  }

  const m = parseProductMetadataForSupplements(productData);
  const rawArr = m.mlImagePipeline?.canonicalSupplementUrls;
  if (Array.isArray(rawArr)) {
    let idx = 0;
    for (const x of rawArr) {
      if (typeof x !== 'string') continue;
      const t = x.trim();
      const lower = t.toLowerCase();
      if (!lower.startsWith('https://') && !lower.startsWith('http://')) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push({
        url: t,
        objectKey: `canonical_supplement_${idx++}`,
        sourceKind: 'canonical_supplement',
      });
    }
  }

  const supplierOnly = supplierImageUrls
    .map((u) => u.trim())
    .filter((u) => {
      const lower = u.toLowerCase();
      if (!lower.startsWith('https://') && !lower.startsWith('http://')) return false;
      return !seen.has(u);
    });

  const enumerated = enumerateMainCandidates(supplierOnly);
  for (const e of enumerated) {
    if (seen.has(e.url)) continue;
    seen.add(e.url);
    out.push({ url: e.url, objectKey: e.objectKey, sourceKind: 'supplier' });
  }

  return out;
}

/** Canonical pipeline + P103: full gallery URL list with portada supplement first. */
export function mergePortadaPriorityImageUrls(supplierUrls: string[], productData?: unknown): string[] {
  return buildPortadaRebuildCandidateList(supplierUrls, productData).map((c) => c.url);
}

export function isPortadaSupplementHeroConfigured(productData: unknown, workspaceRoot?: string): boolean {
  return (
    Boolean(parsePortadaSupplementHeroUrl(productData)) ||
    Boolean(parsePortadaSupplementHeroWorkspacePath(productData, workspaceRoot))
  );
}

export function parseProductImageUrls(images: unknown): string[] {
  const out: string[] = [];
  const pushChunks = (raw: string) => {
    const t = raw.trim();
    if (!t.startsWith('http')) return;
    if (!t.includes(';')) out.push(t);
    else t.split(';').forEach((s) => {
      const x = s.trim();
      if (x.startsWith('http')) out.push(x);
    });
  };
  if (!images) return out;
  if (Array.isArray(images)) {
    for (const u of images) {
      if (typeof u === 'string') pushChunks(u);
    }
    return out;
  }
  if (typeof images === 'string') {
    try {
      const j = JSON.parse(images);
      if (Array.isArray(j)) {
        for (const u of j) {
          if (typeof u === 'string') pushChunks(u);
        }
        return out;
      }
    } catch {
      pushChunks(images);
    }
  }
  return out;
}

export function enumerateMainCandidates(urls: string[]): { url: string; objectKey: string | null }[] {
  const detail = DETAIL_SLOT_KEY.toLowerCase();
  const byKey = new Map<string, string>();
  const supplements: { url: string; objectKey: string }[] = [];
  let supIdx = 0;
  for (const u of urls) {
    const k = extractAeImageObjectKey(u);
    if (k === detail) continue;
    if (!k) {
      supplements.push({ url: u, objectKey: `canonical_supplement_${supIdx++}` });
      continue;
    }
    if (!byKey.has(k)) byKey.set(k, u);
  }
  return [...supplements, ...[...byKey.entries()].map(([objectKey, url]) => ({ objectKey, url }))];
}

async function download(url: string): Promise<Buffer> {
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 22000,
    maxContentLength: 12 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller-P76/1.0)',
      Accept: 'image/*',
    },
  });
  return Buffer.from(r.data);
}

function meanRgbFromStats(st: sharp.Stats): { mean: number; stdev: number } {
  const mean = (st.channels[0].mean + st.channels[1].mean + st.channels[2].mean) / 3;
  const stdev = (st.channels[0].stdev + st.channels[1].stdev + st.channels[2].stdev) / 3;
  return { mean, stdev };
}

async function edgeStripMetrics(buf: Buffer): Promise<{ meanRgb: number; avgStdev: number }> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 32 || H < 32) return { meanRgb: 0, avgStdev: 99 };
  const tv = Math.max(4, Math.floor(H * 0.08));
  const sh = Math.max(4, Math.floor(W * 0.08));
  const regions = [
    { left: 0, top: 0, width: W, height: tv },
    { left: 0, top: H - tv, width: W, height: tv },
    { left: 0, top: 0, width: sh, height: H },
    { left: W - sh, top: 0, width: sh, height: H },
  ];
  let sumM = 0;
  let sumS = 0;
  for (const r of regions) {
    const st = await sharp(buf).rotate().extract(r).flatten({ background: '#ffffff' }).stats();
    const { mean, stdev } = meanRgbFromStats(st);
    sumM += mean;
    sumS += stdev;
  }
  return { meanRgb: sumM / 4, avgStdev: sumS / 4 };
}

async function centerMetrics(buf: Buffer, keep: number): Promise<{ meanRgb: number; stdevRgb: number }> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 16 || H < 16) return { meanRgb: 0, stdevRgb: 0 };
  const cw = Math.floor(W * keep);
  const ch = Math.floor(H * keep);
  const left = Math.floor((W - cw) / 2);
  const top = Math.floor((H - ch) / 2);
  const st = await sharp(buf)
    .rotate()
    .extract({ left, top, width: cw, height: ch })
    .flatten({ background: '#ffffff' })
    .stats();
  const { mean, stdev } = meanRgbFromStats(st);
  return { meanRgb: mean, stdevRgb: stdev };
}

async function scoreBufferToCandidate(buf: Buffer, objectKey: string | null, url: string): Promise<ScoredImageCandidate> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const edge = await edgeStripMetrics(buf);
  const center = await centerMetrics(buf, 0.58);

  const textLogoRisk = Math.min(100, edge.avgStdev * 1.85 + Math.max(0, 40 - edge.meanRgb * 0.12));
  const backgroundSimplicity = Math.min(100, edge.meanRgb * 0.32 + Math.max(0, 45 - edge.avgStdev) * 1.2);
  const productOccupancy = Math.min(100, center.stdevRgb * 1.1 + Math.min(40, Math.abs(180 - center.meanRgb) * 0.15));
  const clutterPackagingRisk = Math.min(100, edge.avgStdev * 1.4);
  const centeringBalance = W > 0 && H > 0 ? Math.max(0, 100 - Math.abs(W / H - 1) * 120) : 40;
  const catalogLook = Math.min(100, backgroundSimplicity * 0.45 + (100 - textLogoRisk) * 0.35 + centeringBalance * 0.2);
  const conversionAttractiveness = Math.min(
    100,
    productOccupancy * 0.35 + centeringBalance * 0.25 + catalogLook * 0.35 + Math.min(20, (W * H) / (800 * 800) * 20)
  );
  const remediationPotential = Math.min(
    100,
    (edge.meanRgb / 255) * 40 + Math.max(0, 38 - edge.avgStdev) * 1.05 + (center.stdevRgb / 90) * 22
  );

  const profile = getMercadoLibreChilePolicyProfile();
  const slot = profile.slots.main;
  let policyFitness = 55;
  if (W >= slot.minWidth && H >= slot.minHeight) policyFitness += 12;
  if (Math.abs(W / Math.max(H, 1) - 1) <= slot.maxAspectRatioDeviation) policyFitness += 8;
  if (edge.meanRgb >= slot.minEdgeMeanLuminance) policyFitness += 10;
  if (edge.avgStdev <= slot.maxEdgeTextureStdev) policyFitness += 10;
  policyFitness -= textLogoRisk * 0.12;
  policyFitness -= clutterPackagingRisk * 0.08;
  policyFitness = Math.max(0, Math.min(100, policyFitness));

  const conversionFitness = Math.max(
    0,
    Math.min(100, conversionAttractiveness * 0.55 + productOccupancy * 0.25 + (100 - clutterPackagingRisk) * 0.2)
  );

  const combinedScore = policyFitness * 0.52 + conversionFitness * 0.48;

  // P81 — remediation fitness: expected trim/subject separation strength that makes it easier
  // to produce a strong portada after background cleanup + square/inset framing.
  // This is intentionally independent from the final hero gate; it's a pre-remediation heuristic.
  let trimSubjectAreaRatio = 0;
  let trimExtentBalance = 0;
  let trimWidthRatio = 0;
  let trimHeightRatio = 0;
  let trimMetricsAvailable = true;
  let predictedHeroFailures: string[] = [];

  try {
    const t = profile.heroCoverGate;
    const threshold = t.trimThreshold;

    const trimmedMeta = await sharp(buf).rotate().trim({ threshold }).metadata();
    const tw = trimmedMeta.width ?? 0;
    const th = trimmedMeta.height ?? 0;

    if (W <= 0 || H <= 0 || tw <= 0 || th <= 0) {
      trimMetricsAvailable = false;
    } else {
      trimWidthRatio = tw / W;
      trimHeightRatio = th / H;
      trimSubjectAreaRatio = (tw * th) / (W * H);
      const sm = Math.min(trimWidthRatio, trimHeightRatio);
      const lg = Math.max(trimWidthRatio, trimHeightRatio);
      trimExtentBalance = lg > 0 ? sm / lg : 0;

      // Mirror hero gate thresholds as a predictor.
      if (trimSubjectAreaRatio < t.minSubjectAreaRatio) {
        predictedHeroFailures.push(
          `pred_hero_subject_area_${trimSubjectAreaRatio.toFixed(3)}_below_${t.minSubjectAreaRatio}`
        );
      }
      if (trimWidthRatio < t.minSubjectWidthRatio) {
        predictedHeroFailures.push(
          `pred_hero_subject_width_${trimWidthRatio.toFixed(3)}_below_${t.minSubjectWidthRatio}`
        );
      }
      if (trimHeightRatio < t.minSubjectHeightRatio) {
        predictedHeroFailures.push(
          `pred_hero_subject_height_${trimHeightRatio.toFixed(3)}_below_${t.minSubjectHeightRatio}`
        );
      }
      if (trimExtentBalance < t.minExtentBalance) {
        predictedHeroFailures.push(`pred_hero_extent_balance_${trimExtentBalance.toFixed(3)}_below_${t.minExtentBalance}`);
      }
    }
  } catch {
    trimMetricsAvailable = false;
  }

  const trimSuccessScore = (() => {
    if (!trimMetricsAvailable) return 0;
    const t = profile.heroCoverGate;
    const subjectAreaScore = Math.max(0, Math.min(1, trimSubjectAreaRatio / t.minSubjectAreaRatio)) * 100;
    const wScore = Math.max(0, Math.min(1, trimWidthRatio / t.minSubjectWidthRatio)) * 100;
    const hScore = Math.max(0, Math.min(1, trimHeightRatio / t.minSubjectHeightRatio)) * 100;
    const eScore = Math.max(0, Math.min(1, trimExtentBalance / t.minExtentBalance)) * 100;
    // Expected ability to yield a strong crop after remediation.
    return subjectAreaScore * 0.42 + wScore * 0.18 + hScore * 0.18 + eScore * 0.22;
  })();

  const nearBlankRiskPenalty = (() => {
    // Near-blank sources tend to look “whiteish” with almost no usable texture.
    // Use remediationPotential and edge texture as proxies.
    const textureWeak = edge.avgStdev < 10 && center.stdevRgb < 12;
    const meanBright = edge.meanRgb > 235;
    // Make this penalty large: selection should avoid “almost all white” sources up-front.
    return textureWeak && meanBright ? 55 : 0;
  })();

  const fullCanvasTrimPenalty = (() => {
    // If trim suggests whole-canvas “subject”, background cleanup is risky.
    // (Hero gate might pass incorrectly; we want to choose easier candidates.)
    if (!trimMetricsAvailable) return 0;
    const risk = trimSubjectAreaRatio >= profile.outputIntegrityGate.minSubjectAreaRatioForTrimSuspicion;
    // Penalize especially if trim indicates almost full canvas and texture is not strong.
    if (risk && edge.avgStdev < 10) return 40;
    if (risk && edge.avgStdev < 18) return 25;
    return 0;
  })();

  const remediationFitness = (() => {
    const baseFromHeroPredictor = trimSuccessScore * 0.48;
    const baseFromBackgroundSimplicity = backgroundSimplicity * 0.16;
    const baseFromTextRisk = (100 - textLogoRisk) * 0.14;
    const baseFromCompositionSurvivability = (productOccupancy * 0.14 + centeringBalance * 0.12);
    const baseFromSignalProxy = remediationPotential * 0.08;
    const raw = baseFromHeroPredictor + baseFromBackgroundSimplicity + baseFromTextRisk + baseFromCompositionSurvivability + baseFromSignalProxy;
    return Math.max(0, Math.min(100, raw - nearBlankRiskPenalty - fullCanvasTrimPenalty));
  })();

  const remediationFitnessReasons = (() => {
    const reasons: string[] = [];
    reasons.push(`remFit_text_logo_risk_${textLogoRisk.toFixed(0)}`);
    reasons.push(`remFit_background_simplicity_${backgroundSimplicity.toFixed(0)}`);
    if (!trimMetricsAvailable) {
      reasons.push('remFit_trim_predictor_unavailable');
      return reasons;
    }
    reasons.push(
      `remFit_pred_trim_area_${trimSubjectAreaRatio.toFixed(3)}_extent_${trimExtentBalance.toFixed(3)}`
    );
    if (predictedHeroFailures.length > 0) {
      reasons.push(`remFit_predicted_hero_fail_${predictedHeroFailures[0]}`);
    } else {
      reasons.push('remFit_predicted_hero_pass');
    }
    return reasons.slice(0, 4);
  })();

  return {
    objectKey,
    url,
    scores: {
      textLogoRisk: Number(textLogoRisk.toFixed(2)),
      backgroundSimplicity: Number(backgroundSimplicity.toFixed(2)),
      centeringBalance: Number(centeringBalance.toFixed(2)),
      productOccupancy: Number(productOccupancy.toFixed(2)),
      clutterPackagingRisk: Number(clutterPackagingRisk.toFixed(2)),
      catalogLook: Number(catalogLook.toFixed(2)),
      conversionAttractiveness: Number(conversionAttractiveness.toFixed(2)),
      remediationFitness: Number(remediationFitness.toFixed(2)),
      remediationPotential: Number(remediationPotential.toFixed(2)),
    },
    policyFitness: Number(policyFitness.toFixed(2)),
    conversionFitness: Number(conversionFitness.toFixed(2)),
    combinedScore: Number(combinedScore.toFixed(2)),
    remediationFitnessReasons,
  };
}

export async function scoreImageCandidate(url: string, objectKey: string | null): Promise<ScoredImageCandidate> {
  const buf = await download(url);
  return scoreBufferToCandidate(buf, objectKey, url);
}

/** Score an in-memory image (e.g. on-disk approved pack) with the same model as remote URLs. */
export async function scoreImageCandidateFromBuffer(
  buf: Buffer,
  objectKey: string | null,
  url: string
): Promise<ScoredImageCandidate> {
  return scoreBufferToCandidate(buf, objectKey, url);
}
