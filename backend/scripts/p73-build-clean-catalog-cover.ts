#!/usr/bin/env tsx
/**
 * P73: Build ML-compliant PORTADA — flat light background + reduced edge text/logo risk.
 * Seller reasons addressed: logos/text (center crop + de-sat catalog look), non-light bg (plain #f8f9fa canvas).
 */
import '../src/config/env';

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../src/config/database';

const SIDE = 1536;
/** Flat plain light gray — no wood/texture (ML "fondo claro"). */
const CATALOG_BG = { r: 248, g: 249, b: 250 };
const INNER_MAX = 1280;
/** Fraction of width/height kept from center (drops packaging strips / corner badges). */
const CENTER_KEEP = 0.72;

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
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller-P73/1.0)',
      Accept: 'image/*',
    },
  });
  return Buffer.from(r.data);
}

/** Mean RGB on center region only — proxy for "product on light field" vs dark lifestyle. */
async function scoreCenterLuminance(buf: Buffer): Promise<number> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 16 || H < 16) return 0;
  const cw = Math.floor(W * CENTER_KEEP);
  const ch = Math.floor(H * CENTER_KEEP);
  const left = Math.floor((W - cw) / 2);
  const top = Math.floor((H - ch) / 2);
  const stats = await sharp(buf)
    .rotate()
    .extract({ left, top, width: cw, height: ch })
    .flatten({ background: '#ffffff' })
    .stats();
  return (
    (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3
  );
}

async function buildCleanCatalogCover(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 800;
  const H = meta.height ?? 800;
  const cw = Math.floor(W * CENTER_KEEP);
  const ch = Math.floor(H * CENTER_KEEP);
  const left = Math.floor((W - cw) / 2);
  const top = Math.floor((H - ch) / 2);

  const resized = await sharp(buf)
    .rotate()
    .extract({ left, top, width: cw, height: ch })
    .flatten({ background: '#ffffff' })
    .resize(INNER_MAX, INNER_MAX, { fit: 'inside', background: { r: 255, g: 255, b: 255 } })
    .modulate({ saturation: 0.88, brightness: 1.06 })
    .sharpen({ sigma: 0.45 })
    .png()
    .toBuffer();

  const m = await sharp(resized).metadata();
  const w = m.width ?? INNER_MAX;
  const h = m.height ?? INNER_MAX;
  const lx = Math.floor((SIDE - w) / 2);
  const ty = Math.floor((SIDE - h) / 2);

  return sharp({
    create: { width: SIDE, height: SIDE, channels: 3, background: CATALOG_BG },
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

  const scored: { key: string; url: string; centerMean: number }[] = [];
  for (const [key, url] of byKey) {
    const buf = await download(url);
    const centerMean = await scoreCenterLuminance(buf);
    scored.push({ key, url, centerMean });
  }
  scored.sort((a, b) => b.centerMean - a.centerMean);
  const winner = scored[0];
  if (!winner) throw new Error('p73_no_supplier_source_excluding_detail');

  const packDir = path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', `product-${productId}`);
  if (!fs.existsSync(packDir)) throw new Error(`pack_dir_missing:${packDir}`);

  const coverPath = path.join(packDir, 'cover_main.png');
  const detailPath = path.join(packDir, 'detail_mount_interface.png');
  if (!fs.existsSync(detailPath)) throw new Error('detail_mount_interface_missing');

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (fs.existsSync(coverPath)) {
    fs.copyFileSync(coverPath, path.join(packDir, `cover_main.pre_p73_backup_${ts}.png`));
  }

  const srcBuf = await download(winner.url);
  const coverBuf = await buildCleanCatalogCover(srcBuf);
  fs.writeFileSync(coverPath, coverBuf);

  const cStats = await sharp(coverBuf).stats();
  const meanOut =
    (cStats.channels[0].mean + cStats.channels[1].mean + cStats.channels[2].mean) / 3;

  console.log(
    JSON.stringify(
      {
        productId,
        strategy: 'p73_clean_catalog_cover_center_crop_flat_light_bg',
        sellerReasonsTargeted: [
          'Contiene logos y/o textos.',
          'No tiene fondo claro o con textura.',
        ],
        centerKeepRatio: CENTER_KEEP,
        catalogBackgroundRgb: CATALOG_BG,
        sourceRanking: scored.map((s) => ({ objectKey: s.key, centerMeanRgb: Number(s.centerMean.toFixed(2)) })),
        selectedSourceUrl: winner.url,
        selectedSourceObjectKey: winner.key,
        detailPreserved: detailPath,
        outputCoverMeanRgb: Number(meanOut.toFixed(2)),
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
