#!/usr/bin/env tsx
/**
 * P70: Rebuild only cover_main.png from a supplier URL that is NOT the flagged cover key
 * and NOT the current detail slot key — leaves detail_mount_interface.png unchanged.
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
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller-P70/1.0)',
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

async function main() {
  const productId = Number(process.argv[2] || 32690);
  /** Keys from P69 live pack: flagged cover lineage + current secondary (preserve). */
  const excludedKeys = new Set(
    [
      'sd63839aaf0834ce88fe4e594b8e2f590m',
      'scdf80a1900764667b3e4c3b600f79325u',
    ].map((k) => k.toLowerCase())
  );

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, images: true },
  });
  if (!product) throw new Error(`product_${productId}_not_found`);

  const urls = flattenProductImages(product.images);
  if (urls.length === 0) throw new Error('product_has_no_supplier_image_urls');

  let coverUrl: string | null = null;
  for (const u of urls) {
    const k = extractAeImageObjectKey(u);
    if (!k) continue;
    if (excludedKeys.has(k)) continue;
    coverUrl = u;
    break;
  }
  if (!coverUrl) {
    throw new Error('p70_no_supplier_url_outside_excluded_cover_detail_keys');
  }

  const packDir = path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', `product-${productId}`);
  if (!fs.existsSync(packDir)) throw new Error(`pack_dir_missing:${packDir}`);

  const coverPath = path.join(packDir, 'cover_main.png');
  const detailPath = path.join(packDir, 'detail_mount_interface.png');
  if (!fs.existsSync(detailPath)) throw new Error('detail_mount_interface_missing_cannot_preserve');

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (fs.existsSync(coverPath)) {
    fs.copyFileSync(coverPath, path.join(packDir, `cover_main.pre_p70_backup_${ts}.png`));
  }

  const buf = await download(coverUrl);
  const coverBuf = await buildCatalogFullFrame(buf);
  fs.writeFileSync(coverPath, coverBuf);

  const cStats = await sharp(coverBuf).stats();
  const meanC =
    (cStats.channels[0].mean + cStats.channels[1].mean + cStats.channels[2].mean) / 3;

  console.log(
    JSON.stringify(
      {
        productId,
        strategy: 'p70_cover_only_new_supplier_key',
        excludedObjectKeys: [...excludedKeys],
        newCoverSupplierUrl: coverUrl,
        newCoverObjectKey: extractAeImageObjectKey(coverUrl),
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
