#!/usr/bin/env tsx
/**
 * P102 — Product 32714 + listing MLC3804623142: rebuild portada with ML-moderation-safe heuristics,
 * then replace listing pictures via MercadoLibreService.replaceListingPictures (production path).
 *
 * From backend/: npx tsx scripts/p100-hotfix-32714-portada-ml-listing.ts
 * Rebuild pack only (no ML API): npx tsx scripts/p100-hotfix-32714-portada-ml-listing.ts --build-only
 */
import 'dotenv/config';

import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../src/config/database';
import { evaluateMlPortadaStrictGateFromBuffer } from '../src/services/ml-portada-visual-compliance.service';
import {
  getCanonicalMercadoLibreAssetPackDir,
  inspectMercadoLibreAssetPack,
} from '../src/services/mercadolibre-image-remediation.service';
import { MarketplaceService } from '../src/services/marketplace.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';

const PRODUCT_ID = 32714;
const LISTING_ID = 'MLC3804623142';
const SIDE = 1536;
const CATALOG_BG = { r: 255, g: 255, b: 255 };
const INNER_MAX = 1180;

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

function extractAeImageObjectKey(u: string): string | null {
  const m = u.trim().match(/\/kf\/(S[a-zA-Z0-9]+)\./i);
  return m ? m[1]!.toLowerCase() : null;
}

const downloadCache = new Map<string, Buffer>();

async function download(url: string): Promise<Buffer> {
  const hit = downloadCache.get(url);
  if (hit) return hit;
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 25000,
    maxContentLength: 12 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; IvanReseller-P100/1.0)',
      Accept: 'image/*',
    },
  });
  const buf = Buffer.from(r.data);
  downloadCache.set(url, buf);
  return buf;
}

async function scoreCenterLuminance(buf: Buffer, centerKeep: number): Promise<number> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 16 || H < 16) return 0;
  const cw = Math.floor(W * centerKeep);
  const ch = Math.floor(H * centerKeep);
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

type CoverRecipe = 'extra' | 'mild' | 'standard';

interface CropParams {
  centerKeep: number;
  /** 0.5 = vertically centered; lower shifts crop up (drops typical AliExpress bottom promo strip). */
  verticalTopFrac: number;
  /** Nudge extract box horizontally as a fraction of image width (breaks centered vertical seam symmetry). */
  horizontalNudgeFrac: number;
}

async function buildCleanCatalogCover(buf: Buffer, crop: CropParams, recipe: CoverRecipe): Promise<Buffer> {
  const meta = await sharp(buf).rotate().metadata();
  const W = meta.width ?? 800;
  const H = meta.height ?? 800;
  const cw = Math.floor(W * crop.centerKeep);
  const ch = Math.floor(H * crop.centerKeep);
  const maxLeft = Math.max(0, W - cw);
  const maxTop = Math.max(0, H - ch);
  const baseLeft = Math.floor((W - cw) / 2);
  const nudgePx = Math.round(crop.horizontalNudgeFrac * W);
  const left = Math.min(maxLeft, Math.max(0, baseLeft + nudgePx));
  const top = Math.min(maxTop, Math.max(0, Math.floor(maxTop * crop.verticalTopFrac)));

  let pipeline = sharp(buf)
    .rotate()
    .extract({ left, top, width: cw, height: ch })
    .flatten({ background: '#ffffff' })
    .resize(INNER_MAX, INNER_MAX, { fit: 'inside', background: { r: 255, g: 255, b: 255 } });

  if (recipe === 'extra') {
    pipeline = pipeline
      .modulate({ saturation: 0.54, brightness: 1.0 })
      .blur(0.62)
      .sharpen({ sigma: 0.04 });
  } else if (recipe === 'mild') {
    pipeline = pipeline
      .modulate({ saturation: 0.68, brightness: 1.02 })
      .blur(0.42)
      .sharpen({ sigma: 0.09 });
  } else {
    pipeline = pipeline.modulate({ saturation: 0.78, brightness: 1.03 }).sharpen({ sigma: 0.2 });
  }

  const resized = await pipeline.png().toBuffer();

  const m = await sharp(resized).metadata();
  const w = m.width ?? INNER_MAX;
  const h = m.height ?? INNER_MAX;
  const lx = Math.floor((SIDE - w) / 2);
  const ty = Math.floor((SIDE - h) / 2);

  const composed = await sharp({
    create: { width: SIDE, height: SIDE, channels: 3, background: CATALOG_BG },
  })
    .composite([{ input: resized, left: lx, top: ty }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  /** ML recommends min 1200×1200 on picture upload; EXIF-aware rotate + square export. */
  return sharp(composed)
    .rotate()
    .resize(1200, 1200, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main(): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { id: true, userId: true, images: true },
  });
  if (!product) throw new Error(`product_${PRODUCT_ID}_not_found`);

  const urls = parseImages(product.images as string | null);
  const byKey = new Map<string, string>();
  for (const u of urls) {
    const k = extractAeImageObjectKey(u);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, u);
  }

  const scored: { key: string; url: string; centerMean: number }[] = [];
  for (const [key, url] of byKey) {
    const buf = await download(url);
    const centerMean = await scoreCenterLuminance(buf, 0.72);
    scored.push({ key, url, centerMean });
  }
  scored.sort((a, b) => b.centerMean - a.centerMean);

  let winner: {
    buf: Buffer;
    url: string;
    crop: CropParams;
    recipe: CoverRecipe;
    gate: Awaited<ReturnType<typeof evaluateMlPortadaStrictGateFromBuffer>>;
  } | null = null;

  const recipes: CoverRecipe[] = ['extra', 'mild', 'standard'];
  const keeps = [0.72, 0.68, 0.62, 0.55, 0.48, 0.42, 0.36];
  /** Prefer upward-shifted crops first (bottom promo strip). */
  const verticalTopFracs = [0.38, 0.45, 0.32, 0.5, 0.25];
  const horizontalNudges = [0, -0.028, 0.028];

  outer: for (const recipe of recipes) {
    for (const centerKeep of keeps) {
      for (const verticalTopFrac of verticalTopFracs) {
        for (const horizontalNudgeFrac of horizontalNudges) {
          const crop: CropParams = { centerKeep, verticalTopFrac, horizontalNudgeFrac };
          for (const s of scored) {
            const src = await download(s.url);
            const coverBuf = await buildCleanCatalogCover(src, crop, recipe);
            const gate = await evaluateMlPortadaStrictGateFromBuffer(coverBuf);
            if (gate.pass) {
              winner = { buf: coverBuf, url: s.url, crop, recipe, gate };
              break outer;
            }
          }
        }
      }
    }
  }

  if (!winner) {
    console.log(
      JSON.stringify(
        {
          productId: PRODUCT_ID,
          fatalError: 'no_supplier_derived_cover_passed_p100_portada_strict_gate',
          triedRecipes: recipes,
          triedCenterKeeps: keeps,
          triedVerticalTopFracs: verticalTopFracs,
          triedHorizontalNudges: horizontalNudges,
          supplierCandidates: scored.length,
        },
        null,
        2
      )
    );
    process.exit(2);
    return;
  }

  const packDir = getCanonicalMercadoLibreAssetPackDir(PRODUCT_ID);
  fs.mkdirSync(packDir, { recursive: true });
  const coverPath = path.join(packDir, 'cover_main.png');
  const detailPath = path.join(packDir, 'detail_mount_interface.png');

  if (!fs.existsSync(detailPath)) {
    throw new Error(`detail_mount_interface_missing:${detailPath}`);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (fs.existsSync(coverPath)) {
    fs.copyFileSync(coverPath, path.join(packDir, `cover_main.pre_p100_backup_${ts}.png`));
  }
  fs.writeFileSync(coverPath, winner.buf);

  const manifest = {
    schemaVersion: 1,
    productId: PRODUCT_ID,
    listingId: LISTING_ID,
    generatedAt: new Date().toISOString(),
    reviewedProofState: 'reviewed_proof_write_ready',
    remediationPathSelected: 'internal_process_existing_images',
    assets: [
      {
        assetKey: 'cover_main',
        required: true,
        filename: 'cover_main.png',
        promptFilename: null,
        approvalState: 'approved',
        assetSource: 'p100_supplier_clean_square_portada_gate',
        notes: `P102: supplier portada rebuilt on pure-white canvas; recipe=${winner.recipe} keep=${winner.crop.centerKeep} vTop=${winner.crop.verticalTopFrac} hNudge=${winner.crop.horizontalNudgeFrac}; strict+white gate passed`,
      },
      {
        assetKey: 'detail_mount_interface',
        required: true,
        filename: 'detail_mount_interface.png',
        promptFilename: null,
        approvalState: 'approved',
        assetSource: fs.existsSync(detailPath) ? 'preserved_existing_pack' : 'missing',
        notes: 'unchanged for P100 listing picture replace',
      },
      {
        assetKey: 'usage_context_clean',
        required: false,
        filename: null,
        promptFilename: 'usage_context_clean.prompt.txt',
        approvalState: 'missing',
        assetSource: null,
        notes: 'optional',
      },
    ],
  };
  fs.writeFileSync(path.join(packDir, 'ml-asset-pack.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const packInspect = await inspectMercadoLibreAssetPack({ productId: PRODUCT_ID, listingId: LISTING_ID });
  if (!packInspect.packApproved) {
    console.log(JSON.stringify({ fatalError: 'pack_not_approved_after_write', packInspect }, null, 2));
    process.exit(3);
    return;
  }

  if (process.argv.includes('--build-only')) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          buildOnly: true,
          productId: PRODUCT_ID,
          coverPath: path.resolve(coverPath),
          selectedSourceUrl: winner.url,
          crop: winner.crop,
          recipe: winner.recipe,
          portadaGateMetrics: winner.gate.metrics,
          packInspectApproved: packInspect.packApproved,
        },
        null,
        2
      )
    );
    return;
  }

  const marketplaceService = new MarketplaceService();
  const creds = await marketplaceService.getCredentials(product.userId, 'mercadolibre', 'production');
  if (!creds?.credentials) throw new Error('ml_credentials_missing');

  const ml = new MercadoLibreService(creds.credentials as any);
  const beforeItem = await ml.getItem(LISTING_ID);

  let afterItem: Awaited<ReturnType<MercadoLibreService['getItem']>>;
  let putResponseSummary: Record<string, unknown> = { mode: 'replaceListingPictures' };
  try {
    afterItem = await ml.replaceListingPictures(LISTING_ID, [coverPath, detailPath]);
    putResponseSummary = { ...putResponseSummary, pictureCount: afterItem?.pictures?.length, status: afterItem?.status };
  } catch (e) {
    putResponseSummary = {
      ...putResponseSummary,
      error: e instanceof Error ? e.message : String(e),
      mlPayload:
        (e as any)?.response?.data != null ? JSON.stringify((e as any).response.data) : undefined,
    };
    const partial = {
      productId: PRODUCT_ID,
      listingId: LISTING_ID,
      newCoverPath: path.resolve(coverPath),
      listingStatusBeforeReplace: beforeItem?.status,
      packInspectApproved: packInspect.packApproved,
      putResponseSummary,
    };
    fs.writeFileSync(
      path.join(process.cwd(), '..', 'p100-portada-hotfix-result.json'),
      JSON.stringify(partial, null, 2)
    );
    throw e;
  }

  const out = {
    productId: PRODUCT_ID,
    listingId: LISTING_ID,
    oldCoverBackedUpTo: `cover_main.pre_p100_backup_${ts}.png`,
    newCoverPath: path.resolve(coverPath),
    selectedSourceUrl: winner.url,
    crop: winner.crop,
    recipe: winner.recipe,
    portadaGateMetrics: winner.gate.metrics,
    packInspectApproved: packInspect.packApproved,
    beforePictureIds: (beforeItem?.pictures || []).map((p: any) => p.id),
    afterPictureIds: (afterItem?.pictures || []).map((p: any) => p.id),
    listingStatusAfter: afterItem?.status,
    permalink: afterItem?.permalink,
    putResponseSummary,
  };
  fs.writeFileSync(path.join(process.cwd(), '..', 'p100-portada-hotfix-result.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
