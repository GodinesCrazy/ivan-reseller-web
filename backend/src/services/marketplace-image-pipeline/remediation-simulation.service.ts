/**
 * P82/P83 — Preview remediation + gate evaluation + calibrated quality ranking
 * before expensive final remediation.
 */
import sharp from 'sharp';
import type {
  CanonicalRemediationSimulationDetail,
  InsetCropFractions,
  MarketplaceImagePolicyProfile,
  ScoredImageCandidate,
} from './types';
import { evaluateSimulationDualGatesOnOutputBuffer } from './dual-gate.service';
import { evaluateHeroCoverQualityOnBuffer } from './hero-cover-quality-gate.service';
import { evaluateOutputIntegrityOnBuffer } from './output-integrity-gate.service';
import { applyRecipePreview, type RecipePreviewFidelity } from './remediation-recipes.service';
import {
  computeCalibratedSimScore,
  evaluateSimulationQualityOnBuffer,
} from './simulation-quality-metrics.service';

function heroSnap(m: {
  subjectAreaRatio: number;
  subjectWidthRatio: number;
  subjectHeightRatio: number;
  extentBalance: number;
  trimThreshold: number;
}) {
  return {
    subjectAreaRatio: m.subjectAreaRatio,
    subjectWidthRatio: m.subjectWidthRatio,
    subjectHeightRatio: m.subjectHeightRatio,
    extentBalance: m.extentBalance,
    trimThreshold: m.trimThreshold,
  };
}

function integritySnap(m: {
  meanLuminance: number;
  luminanceStdev: number;
  signalPixelRatio: number;
  nearWhitePixelRatio: number;
  luminanceRange: number;
  sampleWidth: number;
  sampleHeight: number;
}) {
  return {
    meanLuminance: m.meanLuminance,
    luminanceStdev: m.luminanceStdev,
    signalPixelRatio: m.signalPixelRatio,
    nearWhitePixelRatio: m.nearWhitePixelRatio,
    luminanceRange: m.luminanceRange,
    sampleWidth: m.sampleWidth,
    sampleHeight: m.sampleHeight,
  };
}

async function shrinkForPreview(buf: Buffer, maxDim: number): Promise<Buffer> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W <= 0 || H <= 0) return buf;
  if (W <= maxDim && H <= maxDim) return buf;
  return sharp(buf)
    .rotate()
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .toBuffer();
}

async function simulateOne(params: {
  s: ScoredImageCandidate;
  recipeId: string;
  profile: MarketplaceImagePolicyProfile;
  insetOverride: InsetCropFractions | null;
  previewIn: Buffer;
  fidelityTier: RecipePreviewFidelity;
}): Promise<CanonicalRemediationSimulationDetail | null> {
  const { s, recipeId, profile, insetOverride, previewIn, fidelityTier } = params;
  if (recipeId === 'inset_white_catalog_png' && !insetOverride) return null;
  try {
    const out = await applyRecipePreview(
      recipeId,
      profile,
      previewIn,
      recipeId === 'inset_white_catalog_png' ? insetOverride : null,
      fidelityTier === 'high' ? 'high' : 'low'
    );
    const og = await evaluateSimulationDualGatesOnOutputBuffer(out, profile);
    const heroOut = await evaluateHeroCoverQualityOnBuffer(out, profile);
    const integrityOut = await evaluateOutputIntegrityOnBuffer(out, profile, {
      heroMetrics: heroOut.metrics,
    });
    const simAllCorePass = og.bothPass && heroOut.pass && integrityOut.pass;
    const q = await evaluateSimulationQualityOnBuffer(out, heroOut.metrics, integrityOut.metrics);
    const { simScoreBase, simScore, calibratedReasons } = computeCalibratedSimScore({
      simBothPass: og.bothPass,
      heroPass: heroOut.pass,
      integrityPass: integrityOut.pass,
      subjectAreaRatio: heroOut.metrics.subjectAreaRatio,
      extentBalance: heroOut.metrics.extentBalance,
      subjectWidthRatio: heroOut.metrics.subjectWidthRatio,
      subjectHeightRatio: heroOut.metrics.subjectHeightRatio,
      signalPixelRatio: integrityOut.metrics.signalPixelRatio,
      luminanceRange: integrityOut.metrics.luminanceRange,
      nearWhitePixelRatio: integrityOut.metrics.nearWhitePixelRatio,
      q,
    });

    return {
      candidateUrl: s.url,
      objectKey: s.objectKey,
      recipeId,
      fidelityTier,
      simPolicyPass: og.policy.pass,
      simConversionPass: og.conversion.pass,
      simBothPass: og.bothPass,
      simHeroPass: heroOut.pass,
      simIntegrityPass: integrityOut.pass,
      simScoreBase,
      simScore,
      simAllCorePass,
      simulationQuality: q,
      calibratedReasons,
      heroMetrics: heroSnap(heroOut.metrics),
      integrityMetrics: integritySnap(integrityOut.metrics),
      policyFailures: [...og.policy.failures],
      conversionFailures: [...og.conversion.failures],
      heroFailures: [...heroOut.hero.failures],
      integrityFailures: [...integrityOut.integrity.failures],
    };
  } catch {
    return null;
  }
}

export interface RemediationSimulationRankingResult {
  rows: CanonicalRemediationSimulationDetail[];
  orderedCandidates: ScoredImageCandidate[];
  winner: CanonicalRemediationSimulationDetail | null;
  allWeak: boolean;
  hiFiInvoked: boolean;
  hiFiRowCount: number;
}

export async function runRemediationSimulationRanking(params: {
  profile: MarketplaceImagePolicyProfile;
  shortlist: ScoredImageCandidate[];
  insetOverride: InsetCropFractions | null;
  previewMaxInput: number;
  loadBuffer: (s: ScoredImageCandidate) => Promise<Buffer | null>;
  hiFiEnabled: boolean;
  hiFiTopCandidates: number;
  hiFiMaxInput: number;
}): Promise<RemediationSimulationRankingResult> {
  const {
    profile,
    shortlist,
    insetOverride,
    previewMaxInput,
    loadBuffer,
    hiFiEnabled,
    hiFiTopCandidates,
    hiFiMaxInput,
  } = params;
  const rows: CanonicalRemediationSimulationDetail[] = [];
  const bestByUrl = new Map<
    string,
    { detail: CanonicalRemediationSimulationDetail; score: number }
  >();

  const runForCandidate = async (
    s: ScoredImageCandidate,
    maxIn: number,
    fidelityTier: RecipePreviewFidelity
  ) => {
    let buf: Buffer | null;
    try {
      buf = await loadBuffer(s);
    } catch {
      buf = null;
    }
    if (!buf) return;
    const previewIn = await shrinkForPreview(buf, maxIn);
    for (const recipeId of profile.defaultRemediationRecipeChain) {
      const detail = await simulateOne({
        s,
        recipeId,
        profile,
        insetOverride,
        previewIn,
        fidelityTier,
      });
      if (!detail) continue;
      rows.push(detail);
      const prev = bestByUrl.get(s.url);
      if (!prev || detail.simScore > prev.score) {
        bestByUrl.set(s.url, { detail, score: detail.simScore });
      }
    }
  };

  for (const s of shortlist) {
    await runForCandidate(s, previewMaxInput, 'low');
  }

  let hiFiRowCount = 0;
  let hiFiInvoked = false;

  if (hiFiEnabled && hiFiTopCandidates > 0 && shortlist.length > 0) {
    const rankedForHifi = shortlist
      .map((c, i) => ({ c, i, score: bestByUrl.get(c.url)?.score ?? Number.NEGATIVE_INFINITY }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.i - b.i;
      })
      .map((x) => x.c)
      .slice(0, hiFiTopCandidates);

    hiFiInvoked = rankedForHifi.length > 0;
    const beforeHi = rows.length;
    for (const s of rankedForHifi) {
      await runForCandidate(s, hiFiMaxInput, 'high');
    }
    hiFiRowCount = rows.length - beforeHi;
  }

  const rankedShort = shortlist
    .map((c, i) => ({ c, i, score: bestByUrl.get(c.url)?.score ?? Number.NEGATIVE_INFINITY }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.i - b.i;
    })
    .map((x) => x.c);

  const winnerDetail =
    rows.length === 0 ? null : [...rows].sort((a, b) => b.simScore - a.simScore)[0] ?? null;

  const allWeak = !rows.some((r) => r.simAllCorePass);

  return {
    rows,
    orderedCandidates: rankedShort,
    winner: winnerDetail,
    allWeak,
    hiFiInvoked,
    hiFiRowCount,
  };
}
