#!/usr/bin/env tsx
/**
 * P66: Rebuild ML pack — two DISTINCT full-frame supplier catalog shots when possible
 * (avoids zoom-derivative of same file that may trigger ML duplicate/low-quality review).
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

function normalizeAeImageUrl(u: string): string {
  try {
    const x = new URL(u.trim());
    x.search = '';
    x.hash = '';
    return x.href;
  } catch {
    return u.trim();
  }
}

/** Same `/kf/S…` id = same supplier raster on ae-pic vs alicdn (duplicate-looking second slot). */
function extractAeImageObjectKey(u: string): string | null {
  const m = u.trim().match(/\/kf\/(S[a-zA-Z0-9]+)\./i);
  return m ? m[1]!.toLowerCase() : null;
}

function findSecondDistinctSupplierUrl(urls: string[]): string | null {
  if (urls.length < 2) return null;
  const k0 = extractAeImageObjectKey(urls[0]!);
  const norm0 = normalizeAeImageUrl(urls[0]!);
  for (let i = 1; i < urls.length; i++) {
    const u = urls[i]!.trim();
    const k1 = extractAeImageObjectKey(u);
    if (k0 && k1) {
      if (k1 !== k0) return u;
      continue;
    }
    if (normalizeAeImageUrl(u) !== norm0) return u;
  }
  return null;
}

async function download(url: string): Promise<Buffer> {
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 25000,
    maxContentLength: 12 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller-P66/1.0)',
      Accept: 'image/*',
    },
  });
  return Buffer.from(r.data);
}

/** Center zoom for second slot when only one supplier URL exists (bytes differ from cover). */
async function buildDetailZoomFromSingle(buf: Buffer): Promise<Buffer> {
  let img = sharp(buf).rotate().flatten({ background: '#ffffff' });
  const meta = await img.metadata();
  const W = meta.width ?? 800;
  const H = meta.height ?? 800;
  const cropW = Math.floor(W * 0.62);
  const cropH = Math.floor(H * 0.62);
  const left = Math.floor((W - cropW) / 2);
  const top = Math.floor((H - cropH) / 2);
  const resized = await img
    .extract({ left, top, width: cropW, height: cropH })
    .resize(INNER_MAX, INNER_MAX, { fit: 'inside', background: { r: 255, g: 255, b: 255 } })
    .sharpen({ sigma: 0.75 })
    .modulate({ saturation: 1.12, brightness: 1.03 })
    .png()
    .toBuffer();
  const m = await sharp(resized).metadata();
  const w = m.width ?? INNER_MAX;
  const h = m.height ?? INNER_MAX;
  const l = Math.floor((SIDE - w) / 2);
  const t = Math.floor((SIDE - h) / 2);
  return sharp({
    create: { width: SIDE, height: SIDE, channels: 3, background: BG },
  })
    .composite([{ input: resized, left: l, top: t }])
    .png({ compressionLevel: 9 })
    .toBuffer();
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

async function main() {
  const productId = Number(process.argv[2] || 32690);
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, title: true, images: true },
  });
  if (!product) throw new Error(`product_${productId}_not_found`);

  const urls = parseImages(product.images);
  if (urls.length === 0) throw new Error('product_has_no_supplier_image_urls');

  const packDir = path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', `product-${productId}`);
  if (!fs.existsSync(packDir)) throw new Error(`pack_dir_missing:${packDir}`);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const coverPath = path.join(packDir, 'cover_main.png');
  const detailPath = path.join(packDir, 'detail_mount_interface.png');

  for (const [p, label] of [
    [coverPath, 'cover_main'],
    [detailPath, 'detail_mount_interface'],
  ] as const) {
    if (fs.existsSync(p)) {
      fs.copyFileSync(p, path.join(packDir, `${label}.pre_p66_backup_${ts}.png`));
    }
  }

  const firstBuf = await download(urls[0]!);
  let strategy: string;
  let coverBuf: Buffer;
  let detailBuf: Buffer;
  let usedUrls: string[];

  const secondDistinct = findSecondDistinctSupplierUrl(urls);

  const flagPath = path.join(packDir, 'p66_single_supplier_url.flag');
  if (secondDistinct) {
    if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);
    const secondBuf = await download(secondDistinct);
    coverBuf = await buildCatalogFullFrame(firstBuf);
    detailBuf = await buildCatalogFullFrame(secondBuf);
    strategy = 'two_distinct_supplier_full_frame_catalog';
    usedUrls = [urls[0]!, secondDistinct];
  } else {
    coverBuf = await buildCatalogFullFrame(firstBuf);
    detailBuf = await buildDetailZoomFromSingle(firstBuf);
    strategy = 'single_supplier_url_cover_plus_distinct_zoom_detail';
    usedUrls = [urls[0]!];
    const flagPathSingle = path.join(packDir, 'p66_single_supplier_url.flag');
    if (fs.existsSync(flagPathSingle)) fs.unlinkSync(flagPathSingle);
  }

  fs.writeFileSync(coverPath, coverBuf);
  fs.writeFileSync(detailPath, detailBuf);

  const cStats = await sharp(coverBuf).stats();
  const dStats = await sharp(detailBuf).stats();
  const meanC =
    (cStats.channels[0].mean + cStats.channels[1].mean + cStats.channels[2].mean) / 3;
  const sdC =
    (cStats.channels[0].stdev + cStats.channels[1].stdev + cStats.channels[2].stdev) / 3;
  const meanD =
    (dStats.channels[0].mean + dStats.channels[1].mean + dStats.channels[2].mean) / 3;
  const sdD =
    (dStats.channels[0].stdev + dStats.channels[1].stdev + dStats.channels[2].stdev) / 3;

  console.log(
    JSON.stringify(
      {
        productId,
        strategy,
        supplierUrlsUsed: usedUrls,
        coverMeanRgb: Number(meanC.toFixed(2)),
        coverStdevRgb: Number(sdC.toFixed(2)),
        detailMeanRgb: Number(meanD.toFixed(2)),
        detailStdevRgb: Number(sdD.toFixed(2)),
        identicalCoverDetail: coverBuf.equals(detailBuf),
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
