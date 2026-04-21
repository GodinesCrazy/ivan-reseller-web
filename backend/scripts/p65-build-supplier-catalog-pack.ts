#!/usr/bin/env tsx
/**
 * P65: Build MercadoLibre pack images from real supplier photos (no SVG synthetic).
 * Listing-scoped: default productId 32690.
 */
import 'dotenv/config';

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

async function download(url: string): Promise<Buffer> {
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 25000,
    maxContentLength: 12 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller-P65/1.0)',
      Accept: 'image/*',
    },
  });
  return Buffer.from(r.data);
}

/** Full product on neutral studio-style canvas — large protagonist. */
async function buildCoverFromBuffer(buf: Buffer): Promise<Buffer> {
  const base = sharp(buf).rotate().flatten({ background: '#ffffff' });
  const resized = await base
    .resize(INNER_MAX, INNER_MAX, { fit: 'inside', background: { r: 255, g: 255, b: 255 } })
    .sharpen({ sigma: 0.6 })
    .modulate({ saturation: 1.08, brightness: 1.02 })
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

/** Tighter crop for “mount / interface” clarity; second URL or zoom on first. */
async function buildDetailFromBuffer(buf: Buffer, secondUrl: string | null): Promise<Buffer> {
  let img = sharp(buf).rotate().flatten({ background: '#ffffff' });
  const meta = await img.metadata();
  const W = meta.width ?? 800;
  const H = meta.height ?? 800;

  if (secondUrl) {
    const b2 = await download(secondUrl);
    img = sharp(b2).rotate().flatten({ background: '#ffffff' });
    const m2 = await img.metadata();
    const w2 = m2.width ?? W;
    const h2 = m2.height ?? H;
    const cropW = Math.floor(w2 * 0.72);
    const cropH = Math.floor(h2 * 0.72);
    const left = Math.floor((w2 - cropW) / 2);
    const top = Math.floor((h2 - cropH) / 2);
    img = img.extract({ left, top, width: cropW, height: cropH });
  } else {
    const cropW = Math.floor(W * 0.55);
    const cropH = Math.floor(H * 0.55);
    const left = Math.floor((W - cropW) / 2);
    const top = Math.floor((H - cropH) / 2);
    img = img.extract({ left, top, width: cropW, height: cropH });
  }

  const resized = await img
    .resize(INNER_MAX, INNER_MAX, { fit: 'inside', background: { r: 255, g: 255, b: 255 } })
    .sharpen({ sigma: 0.8 })
    .modulate({ saturation: 1.1, brightness: 1.03 })
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
  if (!product) {
    throw new Error(`product_${productId}_not_found`);
  }
  const urls = parseImages(product.images);
  if (urls.length === 0) {
    throw new Error('product_has_no_supplier_image_urls');
  }

  const packDir = path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', `product-${productId}`);
  if (!fs.existsSync(packDir)) {
    throw new Error(`pack_dir_missing:${packDir}`);
  }

  const first = await download(urls[0]!);
  const second = urls[1] || null;
  const coverBuf = await buildCoverFromBuffer(first);
  const detailBuf = await buildDetailFromBuffer(first, second);

  const coverPath = path.join(packDir, 'cover_main.png');
  const detailPath = path.join(packDir, 'detail_mount_interface.png');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  for (const [p, label] of [
    [coverPath, 'cover_main'],
    [detailPath, 'detail_mount_interface'],
  ] as const) {
    if (fs.existsSync(p)) {
      fs.copyFileSync(p, path.join(packDir, `${label}.pre_p65_backup_${ts}.png`));
    }
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
        title: product.title?.slice(0, 80),
        supplierUrlsUsed: second ? [urls[0], urls[1]] : [urls[0]],
        coverPath,
        detailPath,
        coverMeanRgb: Number(meanC.toFixed(2)),
        coverStdevRgb: Number(sdC.toFixed(2)),
        detailMeanRgb: Number(meanD.toFixed(2)),
        detailStdevRgb: Number(sdD.toFixed(2)),
        strategy: 'real_supplier_photo_catalog_canvas_not_svg',
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
