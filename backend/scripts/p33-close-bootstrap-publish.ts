#!/usr/bin/env tsx
/**
 * P33 — Close MLC1910028953, bootstrap isolation-pipeline image pack, publish product 32722.
 *
 * Usage:
 *   npx tsx scripts/p33-close-bootstrap-publish.ts
 *
 * Steps:
 *   1. Close MLC1910028953 (under_review — must close before re-publishing)
 *   2. Bootstrap image pack for product 32722 using isolation pipeline
 *   3. Publish product 32722 to MercadoLibre Chile (duplicateListing: true)
 *   4. Poll ML API after 90s to confirm status + thumbnail quality
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const backendRoot = path.resolve(__dirname, '..');
function loadEnv(): void {
  const envPath = path.join(backendRoot, '.env');
  const localPath = path.join(backendRoot, '.env.local');
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
  if (fs.existsSync(localPath)) dotenv.config({ path: localPath, override: true });
}
loadEnv();

import { prisma } from '../src/config/database';
import { CredentialsManager, clearCredentialsCache } from '../src/services/credentials-manager.service';
import MercadoLibreService from '../src/services/mercadolibre.service';
import MarketplaceService, { type PublishProductRequest } from '../src/services/marketplace.service';
import {
  autoGenerateSimpleProcessedPack,
  getCanonicalMercadoLibreAssetPackDir,
  inspectMercadoLibreAssetPack,
} from '../src/services/mercadolibre-image-remediation.service';

const LISTING_TO_CLOSE = 'MLC3827943498'; // previous under_review listing
const PRODUCT_ID = 32722;
const USER_ID = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('[P33] === close + bootstrap + publish ===');
  console.log(`[P33] listingToClose=${LISTING_TO_CLOSE} productId=${PRODUCT_ID} userId=${USER_ID}`);

  // ── Step 0: load ML credentials ──────────────────────────────────────────
  clearCredentialsCache(USER_ID, 'mercadolibre', 'production');
  const mlCreds = (await CredentialsManager.getCredentials(
    USER_ID,
    'mercadolibre',
    'production',
  )) as Record<string, unknown> | null;

  const accessToken = String(mlCreds?.accessToken || mlCreds?.access_token || '').trim();
  const refreshToken = String(mlCreds?.refreshToken || mlCreds?.refresh_token || '').trim();
  const sellerId = String(mlCreds?.sellerId || mlCreds?.user_id || '').trim();

  if (!accessToken) {
    console.error('[P33] ABORT: no ML access token in DB for userId=1');
    process.exit(1);
  }
  console.log(`[P33] credentials_ok sellerId=${sellerId || '(unknown)'} hasRefresh=${!!refreshToken}`);

  // ── Step 1: close MLC1910028953 ──────────────────────────────────────────
  console.log(`\n[P33] STEP 1: closing ${LISTING_TO_CLOSE}…`);
  const mlService = new MercadoLibreService({
    accessToken,
    refreshToken,
    userId: sellerId,
    siteId: 'MLC',
    currency: 'CLP',
    language: 'es',
  });

  try {
    await mlService.closeListing(LISTING_TO_CLOSE);
    console.log(`[P33] ✅ ${LISTING_TO_CLOSE} closed via ML API`);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('closed') || msg.toLowerCase().includes('no puedes')) {
      console.log(`[P33] ⚠️  close returned: ${msg} — may already be closed, continuing`);
    } else {
      console.error(`[P33] ❌ close failed: ${msg}`);
      process.exit(1);
    }
  }

  // Also update DB listing record if exists
  try {
    const updated = await prisma.listing.updateMany({
      where: { externalId: LISTING_TO_CLOSE },
      data: { status: 'CLOSED', updatedAt: new Date() },
    });
    if (updated.count > 0) {
      console.log(`[P33] DB listing record updated: status=CLOSED (${updated.count} rows)`);
    }
  } catch {
    // non-critical
  }

  // ── Step 2: bootstrap image pack ─────────────────────────────────────────
  console.log(`\n[P33] STEP 2: bootstrapping image pack for product ${PRODUCT_ID}…`);

  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { id: true, title: true, images: true },
  });

  if (!product) {
    console.error(`[P33] ABORT: product ${PRODUCT_ID} not found in DB`);
    process.exit(1);
  }

  let imageUrls: string[] = [];
  try {
    const parsed = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
    if (Array.isArray(parsed)) {
      imageUrls = parsed.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
    } else if (typeof parsed === 'string' && parsed.startsWith('http')) {
      imageUrls = [parsed];
    }
  } catch {
    console.error('[P33] ABORT: cannot parse product.images');
    process.exit(1);
  }

  console.log(`[P33] product title: ${product.title}`);
  console.log(`[P33] imageUrls found: ${imageUrls.length}`);
  if (imageUrls.length < 2) {
    console.error(`[P33] ABORT: need ≥2 image URLs, found ${imageUrls.length}`);
    process.exit(1);
  }

  const rootDir = getCanonicalMercadoLibreAssetPackDir(PRODUCT_ID);
  console.log(`[P33] rootDir: ${rootDir}`);

  const generated = await autoGenerateSimpleProcessedPack({
    productId: PRODUCT_ID,
    title: product.title,
    imageUrls,
    rootDir,
    listingId: null,
  });

  const pack = await inspectMercadoLibreAssetPack({ productId: PRODUCT_ID });
  console.log(`[P33] bootstrap result: generated=${generated} packApproved=${pack.packApproved}`);

  if (!pack.packApproved) {
    console.error('[P33] ABORT: pack not approved after bootstrap — inspect manually');
    console.error(JSON.stringify(pack, null, 2));
    process.exit(1);
  }

  // ── Step 3: publish ──────────────────────────────────────────────────────
  console.log(`\n[P33] STEP 3: publishing product ${PRODUCT_ID} to mercadolibre…`);

  const marketplaceService = new MarketplaceService();
  const publishRequest: PublishProductRequest = {
    productId: PRODUCT_ID,
    marketplace: 'mercadolibre',
    duplicateListing: true,
  };
  const publishResult = await marketplaceService.publishProduct(
    USER_ID,
    publishRequest,
    'production',
  );

  console.log(`[P33] publish result:`);
  console.log(JSON.stringify(publishResult, null, 2));

  const newListingId: string | undefined =
    (publishResult as any)?.listingId ||
    (publishResult as any)?.externalId ||
    (publishResult as any)?.id;

  if (!newListingId) {
    console.error('[P33] ABORT: publish succeeded but no listing ID in response');
    process.exit(1);
  }

  console.log(`\n[P33] ✅ New listing created: ${newListingId}`);

  // ── Step 4: poll ML API after 90s ────────────────────────────────────────
  console.log(`\n[P33] STEP 4: waiting 90s for ML async review…`);
  await sleep(90_000);

  console.log('[P33] polling ML API for listing status…');
  try {
    const itemData = await mlService.getItem(newListingId);
    const status = (itemData as any)?.status;
    const health = (itemData as any)?.health;
    const thumbQuality = (itemData as any)?.catalog_listing?.thumbnail_quality ||
      (itemData as any)?.pictures?.[0]?.quality ||
      'unknown';

    console.log(`[P33] status=${status} health=${health} thumbnail_quality=${thumbQuality}`);
    if (status === 'active') {
      console.log('[P33] ✅ PASS — listing is active');
    } else {
      console.log(`[P33] ⚠️  listing status=${status} — manual check required`);
    }
    console.log('[P33] full item snapshot:');
    console.log(JSON.stringify({
      id: (itemData as any)?.id,
      status,
      health,
      thumbnail_id: (itemData as any)?.thumbnail_id,
      pictures: (itemData as any)?.pictures?.map((p: any) => ({ id: p.id, quality: p.quality })),
    }, null, 2));
  } catch (err: any) {
    console.error('[P33] poll failed:', err?.message);
  }

  console.log('\n[P33] === DONE ===');
}

main()
  .catch((err) => {
    console.error('[P33] FATAL:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
