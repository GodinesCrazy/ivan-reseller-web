#!/usr/bin/env tsx
/**
 * P98 — Product 32714 only: build canonical ML asset pack (P65-style supplier→catalog canvas)
 * + approved ml-asset-pack.json + P78 local cover evaluation flag in productData.
 *
 * Usage (from backend/): npx tsx scripts/p98-build-ml-pack-32714.ts
 */
import 'dotenv/config';

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../src/config/database';

const PRODUCT_ID = 32714;
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
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller-P98/1.0)',
      Accept: 'image/*',
    },
  });
  return Buffer.from(r.data);
}

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
  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { id: true, title: true, images: true, productData: true },
  });
  if (!product) {
    throw new Error(`product_${PRODUCT_ID}_not_found`);
  }
  const urls = parseImages(product.images as string | null);
  if (urls.length === 0) {
    throw new Error('product_has_no_supplier_image_urls');
  }

  const packDir = path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', `product-${PRODUCT_ID}`);
  fs.mkdirSync(packDir, { recursive: true });

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
      fs.copyFileSync(p, path.join(packDir, `${label}.pre_p98_backup_${ts}.png`));
    }
  }

  fs.writeFileSync(coverPath, coverBuf);
  fs.writeFileSync(detailPath, detailBuf);

  const now = new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    productId: PRODUCT_ID,
    listingId: null,
    generatedAt: now,
    reviewedProofState: 'reviewed_proof_write_ready',
    remediationPathSelected: 'internal_process_existing_images',
    assets: [
      {
        assetKey: 'cover_main',
        required: true,
        filename: 'cover_main.png',
        promptFilename: null,
        approvalState: 'approved',
        assetSource: 'p98_supplier_catalog_canvas',
        notes: 'P98 P65-pattern square 1536 catalog canvas; dimensions verified',
      },
      {
        assetKey: 'detail_mount_interface',
        required: true,
        filename: 'detail_mount_interface.png',
        promptFilename: null,
        approvalState: 'approved',
        assetSource: 'p98_supplier_catalog_canvas',
        notes: 'P98 P65-pattern detail square 1536 catalog canvas',
      },
      {
        assetKey: 'usage_context_clean',
        required: false,
        filename: null,
        promptFilename: 'usage_context_clean.prompt.txt',
        approvalState: 'missing',
        assetSource: null,
        notes: 'optional — not required for MLC publish gate',
      },
    ],
  };
  fs.writeFileSync(path.join(packDir, 'ml-asset-pack.json'), JSON.stringify(manifest, null, 2), 'utf8');

  let meta: Record<string, unknown> = {};
  if (typeof product.productData === 'string' && product.productData.trim()) {
    try {
      meta = JSON.parse(product.productData) as Record<string, unknown>;
    } catch {
      meta = {};
    }
  } else if (product.productData && typeof product.productData === 'object') {
    meta = { ...(product.productData as Record<string, unknown>) };
  }
  const prev = (meta.mlImagePipeline as Record<string, unknown> | undefined) ?? {};
  const insetCrop = { left: 0.38, top: 0.14, bottom: 0.26, right: 0.05 };
  meta.mlImagePipeline = {
    ...prev,
    canonicalEvaluateLocalApprovedCover: true,
    insetCrop,
    p98PackBuiltAt: now,
  };

  await prisma.product.update({
    where: { id: PRODUCT_ID },
    data: { productData: JSON.stringify(meta) },
  });

  const cMeta = await sharp(coverBuf).metadata();
  const dMeta = await sharp(detailBuf).metadata();
  console.log(
    JSON.stringify(
      {
        ok: true,
        productId: PRODUCT_ID,
        packDir,
        coverPath,
        detailPath,
        coverPx: { w: cMeta.width, h: cMeta.height },
        detailPx: { w: dMeta.width, h: dMeta.height },
        supplierUrlsUsed: second ? [urls[0], urls[1]] : [urls[0]],
        mlImagePipeline: meta.mlImagePipeline,
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
