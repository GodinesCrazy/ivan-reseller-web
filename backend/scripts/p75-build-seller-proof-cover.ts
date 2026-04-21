#!/usr/bin/env tsx
/**
 * P75: Seller-proof ML portada for 32690 — not crop-only.
 * Removes typical AliExpress left-rail dimension graphics (text + arrow) and crushes neutral gray shadows
 * on a pure white field. Listing-scoped defaults for product 32690 / source s2eee0bfe….
 */
import '../src/config/env';

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../src/config/database';

const SIDE = 1536;
const INNER_MAX = 1320;
/** ML warns when “content” width is tiny; scale up narrow SKUs so the subject spans enough pixels. */
const DETAIL_SLOT_KEY = 'scdf80a1900764667b3e4c3b600f79325u';

/**
 * Product 32690 supplier hero (s2eee0bfe…): dimension overlays on top/left + large
 * "orange" color label at bottom — not removable by center-crop-only; use inset crop.
 */
const P75_INSETS_32690 = {
  /** fraction of width: remove left rail (9.7cm + vertical arrow) */
  left: 0.42,
  /** fraction: remove top band (3.5cm + horizontal arrow) */
  top: 0.15,
  /** fraction: remove bottom band ("orange" wordmark / color callout) */
  bottom: 0.28,
  /** fraction: trim right edge clutter if present */
  right: 0.05,
} as const;

/** P32690 hero: supplier key used in P74 (dimension overlay on left in source). */
const DEFAULT_OBJECT_KEY = 's2eee0bfe21604c31b468ed75b002ecdc8';

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
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller-P75/1.0)',
      Accept: 'image/*',
    },
  });
  return Buffer.from(r.data);
}

/**
 * AliExpress shadows / seamless gradients read as "textura" to ML; product plastic keeps chroma.
 * Conservative: only near-neutral pixels in the light range become pure white.
 */
function crushNeutralLightBackground(data: Buffer, width: number, height: number, channels: number): void {
  const chromaMax = 20;
  const lumMin = 178;
  const lumMax = 252;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const M = Math.max(r, g, b);
    const m = Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (M - m <= chromaMax && lum >= lumMin && lum <= lumMax) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      if (channels === 4) data[i + 3] = 255;
    }
  }
}

async function applyNeutralCrushOnRgbPng(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const copy = Buffer.from(data);
  crushNeutralLightBackground(copy, info.width, info.height, info.channels);
  return sharp(copy, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function buildSellerProofCover32690(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 64 || H < 64) throw new Error('source_too_small');

  const li = Math.floor(W * P75_INSETS_32690.left);
  const ri = Math.floor(W * P75_INSETS_32690.right);
  const ti = Math.floor(H * P75_INSETS_32690.top);
  const bi = Math.floor(H * P75_INSETS_32690.bottom);
  const ew = W - li - ri;
  const eh = H - ti - bi;
  if (ew < 48 || eh < 48) throw new Error('inset_crop_too_aggressive');

  const insetBuf = await sharp(buf)
    .rotate()
    .extract({ left: li, top: ti, width: ew, height: eh })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();

  let trimmed: Buffer;
  try {
    trimmed = await sharp(insetBuf).trim({ threshold: 18 }).png().toBuffer();
  } catch {
    trimmed = insetBuf;
  }

  const stripped = await sharp(trimmed)
    .resize(INNER_MAX, INNER_MAX, {
      fit: 'inside',
      background: { r: 255, g: 255, b: 255 },
    })
    .modulate({ saturation: 0.88, brightness: 1.05 })
    .png()
    .toBuffer();

  const m2 = await sharp(stripped).metadata();
  const w2 = m2.width ?? INNER_MAX;
  const h2 = m2.height ?? INNER_MAX;
  const lx = Math.floor((SIDE - w2) / 2);
  const ty = Math.floor((SIDE - h2) / 2);

  const onWhite = await sharp({
    create: { width: SIDE, height: SIDE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: stripped, left: lx, top: ty }])
    .png()
    .toBuffer();

  return applyNeutralCrushOnRgbPng(onWhite);
}

/** Fallback: left-strip only (other SKUs / CLI override path). */
async function buildSellerProofCoverStripLeft(buf: Buffer, stripLeftRatio: number): Promise<Buffer> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 32 || H < 32) throw new Error('source_too_small');

  const cut = Math.min(Math.max(0, stripLeftRatio), 0.45);
  const left = Math.floor(W * cut);
  const newW = W - left;
  if (newW < 32) throw new Error('strip_left_too_aggressive');

  const stripped = await sharp(buf)
    .rotate()
    .extract({ left, top: 0, width: newW, height: H })
    .flatten({ background: '#ffffff' })
    .resize(INNER_MAX, INNER_MAX, {
      fit: 'inside',
      background: { r: 255, g: 255, b: 255 },
    })
    .modulate({ saturation: 0.9, brightness: 1.04 })
    .png()
    .toBuffer();

  const m2 = await sharp(stripped).metadata();
  const w2 = m2.width ?? INNER_MAX;
  const h2 = m2.height ?? INNER_MAX;
  const lx = Math.floor((SIDE - w2) / 2);
  const ty = Math.floor((SIDE - h2) / 2);

  const onWhite = await sharp({
    create: { width: SIDE, height: SIDE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: stripped, left: lx, top: ty }])
    .png()
    .toBuffer();

  return applyNeutralCrushOnRgbPng(onWhite);
}

async function main() {
  const productId = Number(process.argv[2] || 32690);
  const keyArg = process.argv.find((a) => a.startsWith('--object-key='));
  const stripArg = process.argv.find((a) => a.startsWith('--strip-left='));
  const useStripOnly = process.argv.includes('--strip-left-only');
  const objectKeyWanted = (keyArg?.split('=')[1] || DEFAULT_OBJECT_KEY).toLowerCase().trim();
  const stripLeftRatio = stripArg ? Number(stripArg.split('=')[1]) : 0.28;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, images: true },
  });
  if (!product) throw new Error(`product_${productId}_not_found`);

  const urls = flattenProductImages(product.images);
  const byKey = new Map<string, string>();
  for (const u of urls) {
    const k = extractAeImageObjectKey(u);
    if (!k || k === DETAIL_SLOT_KEY.toLowerCase()) continue;
    if (!byKey.has(k)) byKey.set(k, u);
  }

  const url = byKey.get(objectKeyWanted);
  if (!url) {
    throw new Error(`object_key_not_found:${objectKeyWanted}`);
  }

  const packDir = path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', `product-${productId}`);
  if (!fs.existsSync(packDir)) throw new Error(`pack_dir_missing:${packDir}`);
  const coverPath = path.join(packDir, 'cover_main.png');
  const detailPath = path.join(packDir, 'detail_mount_interface.png');
  if (!fs.existsSync(detailPath)) throw new Error('detail_mount_interface_missing');

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (fs.existsSync(coverPath)) {
    fs.copyFileSync(coverPath, path.join(packDir, `cover_main.pre_p75_backup_${ts}.png`));
  }

  const srcBuf = await download(url);
  const coverBuf =
    productId === 32690 && !useStripOnly
      ? await buildSellerProofCover32690(srcBuf)
      : await buildSellerProofCoverStripLeft(srcBuf, stripLeftRatio);
  fs.writeFileSync(coverPath, coverBuf);

  const meta = await sharp(coverBuf).metadata();
  const st = await sharp(coverBuf).stats();
  const mean = (st.channels[0].mean + st.channels[1].mean + st.channels[2].mean) / 3;

  console.log(
    JSON.stringify(
      {
        productId,
        pipeline: 'p75_seller_proof',
        sourceObjectKey: objectKeyWanted,
        sourceUrl: url,
        cropMode:
          productId === 32690 && !useStripOnly
            ? 'listing_32690_annotation_insets'
            : `strip_left_${stripLeftRatio}`,
        insets32690: productId === 32690 && !useStripOnly ? P75_INSETS_32690 : undefined,
        transformations:
          productId === 32690 && !useStripOnly
            ? [
                'rotate_exif',
                'extract_insets_remove_dimension_and_color_callout_bands',
                'flatten_on_white',
                'trim_uniform_margins',
                `resize_fit_inside_${INNER_MAX}`,
                'modulate_sat088_bright105',
                'composite_1536_white_geometric_center',
                'neutral_chroma_crush_background_shadows',
              ]
            : [
                'rotate_exif',
                `extract_drop_left_fraction_${stripLeftRatio}`,
                'flatten_white_before_resize',
                `resize_fit_inside_${INNER_MAX}`,
                'modulate_sat090_bright104',
                'composite_1536_white',
                'neutral_chroma_crush_background_shadows',
              ],
        outputPath: coverPath,
        dimensions: { width: meta.width, height: meta.height },
        fullFrameMeanRgb: Number(mean.toFixed(2)),
        bytes: coverBuf.length,
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
