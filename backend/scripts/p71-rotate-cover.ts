#!/usr/bin/env tsx
/**
 * P71/P72: Rotate PORTADA from real supplier URLs.
 * Default: rank eligible candidates (excludes USED_COVER_KEYS + detail slot).
 * Forced: `--force-key=<objectKey>` skips ranking (P72 explicit next candidate).
 */
import '../src/config/env';

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../src/config/database';

const SIDE = 1536;
const BG = { r: 240, g: 242, b: 245 };
const INNER_MAX = 1320;

/**
 * Append a key here after each deployed PORTADA rotation so the next run skips it.
 * P69: sd63839… · P70: s2eee0bfe… · P71: sd8adf1f1… · P72: sc2ae6d7315…
 */
const USED_COVER_KEYS = new Set(
  [
    'sd63839aaf0834ce88fe4e594b8e2f590m',
    's2eee0bfe21604c31b468ed75b002ecdc8',
    'sd8adf1f1f796411e96d94f9f8c6d45440',
    'sc2ae6d73152646a682a9cf82c78ef794o',
  ].map((k) => k.toLowerCase())
);

/** Current secondary slot supplier key — preserve distinct from portada. */
const DETAIL_SLOT_KEY = 'scdf80a1900764667b3e4c3b600f79325u';

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
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller-P71/1.0)',
      Accept: 'image/*',
    },
  });
  return Buffer.from(r.data);
}

async function buildCatalogFullFrame(buf: Buffer): Promise<Buffer> {
  const resized = await sharp(buf)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(INNER_MAX, INNER_MAX, { fit: 'inside', background: { r: 255, g: 255, b: 255 } })
    .sharpen({ sigma: 0.65 })
    .modulate({ saturation: 1.1, brightness: 1.02 })
    .png()
    .toBuffer();
  const m = await sharp(resized).metadata();
  const w = m.width ?? INNER_MAX;
  const h = m.height ?? INNER_MAX;
  const left = Math.floor((SIDE - w) / 2);
  const top = Math.floor((SIDE - h) / 2);

  return sharp({
    create: { width: SIDE, height: SIDE, channels: 3, background: BG },
  })
    .composite([{ input: resized, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Heuristic: prefer larger native resolution + slightly brighter mean (cleaner catalog feel).
 * Not ML ground truth — ranking aid only.
 */
function parseForceObjectKey(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--force-key=')) {
      return a.slice('--force-key='.length).trim().toLowerCase() || null;
    }
    if (a === '--force-key' && argv[i + 1]) {
      return argv[i + 1]!.trim().toLowerCase() || null;
    }
  }
  return null;
}

async function scoreSupplierCandidate(buf: Buffer): Promise<{
  pixels: number;
  meanRgb: number;
  score: number;
}> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const pixels = w * h;
  const stats = await sharp(buf).rotate().flatten({ background: '#ffffff' }).stats();
  const meanRgb =
    (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
  const score = pixels * (meanRgb / 255);
  return { pixels, meanRgb, score };
}

async function main() {
  const productId = Number(process.argv[2] || 32690);
  const forceObjectKey = parseForceObjectKey(process.argv);
  const detailKey = DETAIL_SLOT_KEY.toLowerCase();
  const excludeCover = new Set(USED_COVER_KEYS);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, images: true },
  });
  if (!product) throw new Error(`product_${productId}_not_found`);

  const urls = flattenProductImages(product.images);
  if (urls.length === 0) throw new Error('product_has_no_supplier_image_urls');

  const byKey = new Map<string, string>();
  for (const u of urls) {
    const k = extractAeImageObjectKey(u);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, u);
  }

  const inventory = [...byKey.entries()].map(([objectKey, url]) => ({
    objectKey,
    url,
    usedAsCoverBefore: excludeCover.has(objectKey),
    isDetailSlotKey: objectKey === detailKey,
    eligibleForCover: !excludeCover.has(objectKey) && objectKey !== detailKey,
  }));

  type Scored = {
    objectKey: string;
    url: string;
    pixels: number;
    meanRgb: number;
    score: number;
  };

  let strategy: string;
  let scored: Scored[];
  let winner: Scored;

  if (forceObjectKey) {
    if (forceObjectKey === detailKey) {
      throw new Error('p72_cannot_force_detail_slot_key_as_cover');
    }
    const forcedUrl = byKey.get(forceObjectKey);
    if (!forcedUrl) {
      throw new Error(`p72_force_key_not_in_product_images:${forceObjectKey}`);
    }
    const buf0 = await download(forcedUrl);
    const s0 = await scoreSupplierCandidate(buf0);
    winner = {
      objectKey: forceObjectKey,
      url: forcedUrl,
      pixels: s0.pixels,
      meanRgb: Number(s0.meanRgb.toFixed(2)),
      score: Number(s0.score.toFixed(2)),
    };
    scored = [winner];
    strategy = 'p72_forced_cover_object_key';
  } else {
    const eligible = inventory.filter((i) => i.eligibleForCover);
    if (eligible.length === 0) {
      throw new Error('p71_no_eligible_cover_candidates_after_exclusions');
    }
    scored = [];
    for (const e of eligible) {
      const buf = await download(e.url);
      const s = await scoreSupplierCandidate(buf);
      scored.push({
        objectKey: e.objectKey,
        url: e.url,
        pixels: s.pixels,
        meanRgb: Number(s.meanRgb.toFixed(2)),
        score: Number(s.score.toFixed(2)),
      });
    }
    scored.sort((a, b) => b.score - a.score);
    winner = scored[0]!;
    strategy = 'p71_cover_candidate_rotation_ranked';
  }

  const packDir = path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', `product-${productId}`);
  if (!fs.existsSync(packDir)) throw new Error(`pack_dir_missing:${packDir}`);

  const coverPath = path.join(packDir, 'cover_main.png');
  const detailPath = path.join(packDir, 'detail_mount_interface.png');
  if (!fs.existsSync(detailPath)) throw new Error('detail_mount_interface_missing_cannot_preserve');

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (fs.existsSync(coverPath)) {
    const tag = forceObjectKey ? 'pre_p72' : 'pre_p71';
    fs.copyFileSync(coverPath, path.join(packDir, `cover_main.${tag}_backup_${ts}.png`));
  }

  const buf = await download(winner.url);
  const coverBuf = await buildCatalogFullFrame(buf);
  fs.writeFileSync(coverPath, coverBuf);

  const cStats = await sharp(coverBuf).stats();
  const meanC =
    (cStats.channels[0].mean + cStats.channels[1].mean + cStats.channels[2].mean) / 3;

  console.log(
    JSON.stringify(
      {
        productId,
        strategy,
        forceObjectKey: forceObjectKey || null,
        inventorySummary: inventory,
        ranking: scored,
        selectedCoverUrl: winner.url,
        selectedObjectKey: winner.objectKey,
        rejectedAlternativeKeys:
          strategy === 'p72_forced_cover_object_key' ? [] : scored.slice(1).map((r) => r.objectKey),
        excludedUsedCoverKeys: [...excludeCover],
        excludedDetailKey: detailKey,
        detailPreservedPath: detailPath,
        coverMeanRgb: Number(meanC.toFixed(2)),
        coverBytes: coverBuf.length,
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
