#!/usr/bin/env tsx
/**
 * P74: Deterministic ML cover policy scoring → direct selection OR specialized remediation → cover_main.png
 * Policy: light/plain background + low text/logo edge risk (heuristic).
 */
import '../src/config/env';

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../src/config/database';

const SIDE = 1536;
const INNER_DIRECT = 1320;
const DETAIL_SLOT_KEY = 'scdf80a1900764667b3e4c3b600f79325u';

/** Remediation: aggressive crop + pure white catalog field. */
const REMEDY_CENTER_KEEP = 0.64;
const REMEDY_BG = { r: 255, g: 255, b: 255 };
const REMEDY_INNER_MAX = 1240;

/** Direct pass: supplier shot already looks like seamless light studio. */
const DIRECT_EDGE_MEAN_MIN = 228;
const DIRECT_EDGE_STDEV_MAX = 22;
const DIRECT_CENTER_MEAN_MIN = 65;
const DIRECT_CENTER_MEAN_MAX = 245;
const DIRECT_CENTER_STDEV_MIN = 6;

function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) {
      return j.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
    }
  } catch {
    /* ignore */
  }
  return [];
}

function splitImageUrlChunks(raw: string): string[] {
  const t = raw.trim();
  if (!t.startsWith('http')) return [];
  if (!t.includes(';')) return [t];
  return t.split(';').map((s) => s.trim()).filter((s) => s.startsWith('http'));
}

function flattenProductImages(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const u of parseImages(raw)) {
    out.push(...splitImageUrlChunks(u));
  }
  return out;
}

function extractAeImageObjectKey(u: string): string | null {
  const m = u.trim().match(/\/kf\/(S[a-zA-Z0-9]+)\./i);
  return m ? m[1]!.toLowerCase() : null;
}

async function download(url: string): Promise<Buffer> {
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 25000,
    maxContentLength: 12 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller-P74/1.0)',
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

/** Border strips ~8% thickness — texture/text often here. */
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

function directPass(edge: { meanRgb: number; avgStdev: number }, center: { meanRgb: number; stdevRgb: number }): boolean {
  return (
    edge.meanRgb >= DIRECT_EDGE_MEAN_MIN &&
    edge.avgStdev <= DIRECT_EDGE_STDEV_MAX &&
    center.meanRgb >= DIRECT_CENTER_MEAN_MIN &&
    center.meanRgb <= DIRECT_CENTER_MEAN_MAX &&
    center.stdevRgb >= DIRECT_CENTER_STDEV_MIN
  );
}

/** Higher = better remediation base (lighter edges, less texture, visible product core). */
function remediationFitness(edge: { meanRgb: number; avgStdev: number }, center: { meanRgb: number; stdevRgb: number }): number {
  const e = Math.min(45, (edge.meanRgb / 255) * 45);
  const t = Math.max(0, 35 - edge.avgStdev * 1.1);
  const c = Math.min(20, (center.stdevRgb / 100) * 20);
  const b = Math.min(10, (center.meanRgb / 255) * 10);
  return Number((e + t + c + b).toFixed(2));
}

async function buildDirectCatalogCover(buf: Buffer): Promise<Buffer> {
  const resized = await sharp(buf)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(INNER_DIRECT, INNER_DIRECT, { fit: 'inside', background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
  const m = await sharp(resized).metadata();
  const w = m.width ?? INNER_DIRECT;
  const h = m.height ?? INNER_DIRECT;
  const left = Math.floor((SIDE - w) / 2);
  const top = Math.floor((SIDE - h) / 2);
  return sharp({
    create: { width: SIDE, height: SIDE, channels: 3, background: { r: 252, g: 252, b: 253 } },
  })
    .composite([{ input: resized, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function buildRemediatedCover(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 800;
  const H = meta.height ?? 800;
  const cw = Math.floor(W * REMEDY_CENTER_KEEP);
  const ch = Math.floor(H * REMEDY_CENTER_KEEP);
  const left = Math.floor((W - cw) / 2);
  const top = Math.floor((H - ch) / 2);
  const resized = await sharp(buf)
    .rotate()
    .extract({ left, top, width: cw, height: ch })
    .flatten({ background: '#ffffff' })
    .resize(REMEDY_INNER_MAX, REMEDY_INNER_MAX, { fit: 'inside', background: { r: 255, g: 255, b: 255 } })
    .modulate({ saturation: 0.82, brightness: 1.09 })
    .sharpen({ sigma: 0.38 })
    .png()
    .toBuffer();
  const m = await sharp(resized).metadata();
  const w = m.width ?? REMEDY_INNER_MAX;
  const h = m.height ?? REMEDY_INNER_MAX;
  const lx = Math.floor((SIDE - w) / 2);
  const ty = Math.floor((SIDE - h) / 2);
  return sharp({
    create: { width: SIDE, height: SIDE, channels: 3, background: REMEDY_BG },
  })
    .composite([{ input: resized, left: lx, top: ty }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  const productId = Number(process.argv[2] || 32690);
  const detailKey = DETAIL_SLOT_KEY.toLowerCase();

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, images: true },
  });
  if (!product) throw new Error(`product_${productId}_not_found`);

  const urls = flattenProductImages(product.images);
  const byKey = new Map<string, string>();
  for (const u of urls) {
    const k = extractAeImageObjectKey(u);
    if (!k || k === detailKey) continue;
    if (!byKey.has(k)) byKey.set(k, u);
  }

  type Row = {
    objectKey: string;
    url: string;
    edgeMeanRgb: number;
    edgeAvgStdev: number;
    centerMeanRgb: number;
    centerStdevRgb: number;
    textLogoRiskScore: number;
    backgroundSimplicityScore: number;
    directPass: boolean;
    remediationFitness: number;
  };

  const scoring: Row[] = [];
  for (const [objectKey, url] of byKey) {
    const buf = await download(url);
    const edge = await edgeStripMetrics(buf);
    const center = await centerMetrics(buf, 0.58);
    const textLogoRiskScore = Number(Math.min(100, edge.avgStdev * 2.2 + (255 - edge.meanRgb) * 0.15).toFixed(2));
    const backgroundSimplicityScore = Number(
      Math.min(100, edge.meanRgb * 0.35 + (40 - Math.min(40, edge.avgStdev)) * 1.5).toFixed(2)
    );
    const dp = directPass(edge, center);
    const rf = remediationFitness(edge, center);
    scoring.push({
      objectKey,
      url,
      edgeMeanRgb: Number(edge.meanRgb.toFixed(2)),
      edgeAvgStdev: Number(edge.avgStdev.toFixed(2)),
      centerMeanRgb: Number(center.meanRgb.toFixed(2)),
      centerStdevRgb: Number(center.stdevRgb.toFixed(2)),
      textLogoRiskScore,
      backgroundSimplicityScore,
      directPass: dp,
      remediationFitness: rf,
    });
  }

  scoring.sort((a, b) => {
    if (a.directPass !== b.directPass) return a.directPass ? -1 : 1;
    return b.remediationFitness - a.remediationFitness;
  });

  const directWinner = scoring.find((r) => r.directPass);
  const chosen = directWinner ?? scoring[0]!;
  const strategy: 'direct_selection_viable' | 'remediation_required' = directWinner
    ? 'direct_selection_viable'
    : 'remediation_required';

  const packDir = path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', `product-${productId}`);
  if (!fs.existsSync(packDir)) throw new Error(`pack_dir_missing:${packDir}`);
  const coverPath = path.join(packDir, 'cover_main.png');
  const detailPath = path.join(packDir, 'detail_mount_interface.png');
  if (!fs.existsSync(detailPath)) throw new Error('detail_mount_interface_missing');

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (fs.existsSync(coverPath)) {
    fs.copyFileSync(coverPath, path.join(packDir, `cover_main.pre_p74_backup_${ts}.png`));
  }

  const srcBuf = await download(chosen.url);
  const coverBuf =
    strategy === 'direct_selection_viable'
      ? await buildDirectCatalogCover(srcBuf)
      : await buildRemediatedCover(srcBuf);

  fs.writeFileSync(coverPath, coverBuf);
  const outStats = await sharp(coverBuf).stats();
  const outMean =
    (outStats.channels[0].mean + outStats.channels[1].mean + outStats.channels[2].mean) / 3;

  console.log(
    JSON.stringify(
      {
        productId,
        strategy,
        policyThresholds: {
          directEdgeMeanMin: DIRECT_EDGE_MEAN_MIN,
          directEdgeStdevMax: DIRECT_EDGE_STDEV_MAX,
          directCenterMeanRange: [DIRECT_CENTER_MEAN_MIN, DIRECT_CENTER_MEAN_MAX],
          directCenterStdevMin: DIRECT_CENTER_STDEV_MIN,
        },
        rankedCandidates: scoring,
        chosenObjectKey: chosen.objectKey,
        chosenUrl: chosen.url,
        chosenDirectPass: chosen.directPass,
        remediationUsed: strategy === 'remediation_required',
        detailPreservedPath: detailPath,
        outputCoverMeanRgb: Number(outMean.toFixed(2)),
        outputCoverBytes: coverBuf.length,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
