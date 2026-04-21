#!/usr/bin/env tsx
/**
 * P34 — Close MLC1911071461 (99% white cover), re-bootstrap with multi-variant isolation, publish.
 *
 * Steps:
 *   1. Close MLC1911071461 (bad cover)
 *   2. Delete stale cover_main.jpg so bootstrap regenerates from scratch
 *   3. Re-bootstrap image pack for product 32722 (tries all isolation variants)
 *   4. Publish product 32722 (duplicateListing: true)
 *   5. Poll ML API after 120s to confirm status + thumbnail quality
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

const LISTING_TO_CLOSE = 'MLC3828313306'; // poor_quality_thumbnail listing
const PRODUCT_ID = 32722;
const USER_ID = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('[P34] === close + re-bootstrap (multi-variant) + publish ===');
  console.log(`[P34] listingToClose=${LISTING_TO_CLOSE} productId=${PRODUCT_ID} userId=${USER_ID}`);

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
    console.error('[P34] ABORT: no ML access token in DB for userId=1');
    process.exit(1);
  }
  console.log(`[P34] credentials_ok sellerId=${sellerId || '(unknown)'} hasRefresh=${!!refreshToken}`);

  const mlService = new MercadoLibreService({
    clientId: '',
    clientSecret: '',
    accessToken,
    refreshToken,
    userId: sellerId,
    siteId: 'MLC',
  });

  // ── Step 1: close MLC1911071461 ──────────────────────────────────────────
  console.log(`\n[P34] STEP 1: closing ${LISTING_TO_CLOSE}…`);
  try {
    await mlService.closeListing(LISTING_TO_CLOSE);
    console.log(`[P34] ✅ ${LISTING_TO_CLOSE} closed via ML API`);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('closed') || msg.toLowerCase().includes('no puedes')) {
      console.log(`[P34] ⚠️  close returned: ${msg} — may already be closed, continuing`);
    } else {
      console.error(`[P34] ❌ close failed: ${msg}`);
      process.exit(1);
    }
  }

  try {
    const updated = await prisma.marketplaceListing.updateMany({
      where: { listingId: LISTING_TO_CLOSE },
      data: { status: 'not_found', updatedAt: new Date() },
    });
    if (updated.count > 0) console.log(`[P34] DB listing record updated: status=CLOSED (${updated.count} rows)`);
  } catch { /* non-critical */ }

  // ── Step 2: delete stale cover so bootstrap regenerates ──────────────────
  console.log(`\n[P34] STEP 2: removing stale cover_main.jpg to force regeneration…`);
  const rootDir = getCanonicalMercadoLibreAssetPackDir(PRODUCT_ID);
  const staleCover = path.join(rootDir, 'cover_main.jpg');
  const staleManifest = path.join(rootDir, 'ml-asset-pack.json');
  if (fs.existsSync(staleCover)) {
    fs.unlinkSync(staleCover);
    console.log(`[P34] deleted ${staleCover}`);
  }
  if (fs.existsSync(staleManifest)) {
    fs.unlinkSync(staleManifest);
    console.log(`[P34] deleted ${staleManifest}`);
  }

  // ── Step 3: re-bootstrap with multi-variant isolation ────────────────────
  console.log(`\n[P34] STEP 3: re-bootstrapping image pack (multi-variant isolation)…`);

  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { id: true, title: true, images: true },
  });

  if (!product) {
    console.error(`[P34] ABORT: product ${PRODUCT_ID} not found in DB`);
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
    console.error('[P34] ABORT: cannot parse product.images');
    process.exit(1);
  }

  console.log(`[P34] product title: ${product.title}`);
  console.log(`[P34] imageUrls found: ${imageUrls.length}`);
  if (imageUrls.length < 2) {
    console.error(`[P34] ABORT: need ≥2 image URLs, found ${imageUrls.length}`);
    process.exit(1);
  }

  const generated = await autoGenerateSimpleProcessedPack({
    productId: PRODUCT_ID,
    title: product.title,
    imageUrls,
    rootDir,
    listingId: null,
  });

  const pack = await inspectMercadoLibreAssetPack({ productId: PRODUCT_ID });
  console.log(`[P34] bootstrap result: generated=${generated} packApproved=${pack.packApproved}`);

  if (!pack.packApproved) {
    console.error('[P34] ABORT: pack not approved after bootstrap — inspect manually');
    console.error(JSON.stringify(pack, null, 2));
    process.exit(1);
  }

  // ── Step 3b: reset product status to VALIDATED_READY ────────────────────
  console.log(`\n[P34] STEP 3b: resetting product ${PRODUCT_ID} status to VALIDATED_READY…`);
  await prisma.product.update({
    where: { id: PRODUCT_ID },
    data: { status: 'VALIDATED_READY', updatedAt: new Date() },
  });
  console.log(`[P34] product status reset to VALIDATED_READY`);

  // ── Step 4: publish ──────────────────────────────────────────────────────
  console.log(`\n[P34] STEP 4: publishing product ${PRODUCT_ID} to mercadolibre…`);
  const marketplaceService = new MarketplaceService();
  const publishRequest: PublishProductRequest = {
    productId: PRODUCT_ID,
    marketplace: 'mercadolibre',
    duplicateListing: true,
  };
  const publishResult = await marketplaceService.publishProduct(USER_ID, publishRequest, 'production');

  console.log('[P34] publish result:');
  console.log(JSON.stringify(publishResult, null, 2));

  const newListingId: string | undefined =
    (publishResult as any)?.listingId ||
    (publishResult as any)?.externalId ||
    (publishResult as any)?.id;

  if (!newListingId) {
    console.error('[P34] ABORT: publish succeeded but no listing ID in response');
    process.exit(1);
  }

  console.log(`\n[P34] ✅ New listing created: ${newListingId}`);

  // ── Step 5: poll ML API after 120s ───────────────────────────────────────
  console.log(`\n[P34] STEP 5: waiting 120s for ML async review…`);
  await sleep(120_000);

  console.log('[P34] polling ML API for listing status…');
  try {
    const itemData = await mlService.getItem(newListingId);
    const status = (itemData as any)?.status;
    const health = (itemData as any)?.health;
    const thumbQuality =
      (itemData as any)?.catalog_listing?.thumbnail_quality ||
      (itemData as any)?.pictures?.[0]?.quality ||
      'unknown';

    console.log(`[P34] status=${status} health=${health} thumbnail_quality=${thumbQuality}`);
    if (status === 'active') {
      console.log('[P34] ✅ PASS — listing is active');
    } else {
      console.log(`[P34] ⚠️  listing status=${status} — manual check required`);
    }
    console.log('[P34] full item snapshot:');
    console.log(
      JSON.stringify(
        {
          id: (itemData as any)?.id,
          status,
          health,
          pictures: (itemData as any)?.pictures?.map((p: any) => ({ id: p.id, quality: p.quality })),
        },
        null,
        2,
      ),
    );
  } catch (err: any) {
    console.error('[P34] poll failed:', err?.message);
  }

  console.log('\n[P34] === DONE ===');
}

main()
  .catch((err) => {
    console.error('[P34] FATAL:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
