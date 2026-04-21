#!/usr/bin/env tsx
/**
 * P43 — Republish product 32722 with new cover_main.jpg (p41 crop+softNeutral).
 * Modeled on P37 pattern using MarketplaceService which handles token refresh
 * and reads the asset pack automatically.
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
const backendRoot = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(backendRoot, '.env'))) dotenv.config({ path: path.join(backendRoot, '.env') });
if (fs.existsSync(path.join(backendRoot, '.env.local'))) dotenv.config({ path: path.join(backendRoot, '.env.local'), override: true });

import { prisma } from '../src/config/database';
import { CredentialsManager, clearCredentialsCache } from '../src/services/credentials-manager.service';
import MercadoLibreService from '../src/services/mercadolibre.service';
import MarketplaceService, { type PublishProductRequest } from '../src/services/marketplace.service';

const PRODUCT_ID = 32722;
const USER_ID = 1;

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function main(): Promise<void> {
  console.log('[P43] === republish product 32722 with new cover ===\n');

  // STEP 1: Confirm product is VALIDATED_READY
  const prod = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { id: true, status: true, isPublished: true },
  });
  console.log(`[P43] DB state: status=${prod?.status} isPublished=${prod?.isPublished}`);

  if (prod?.status !== 'VALIDATED_READY' || prod?.isPublished) {
    await prisma.product.update({
      where: { id: PRODUCT_ID },
      data: { status: 'VALIDATED_READY', isPublished: false },
    });
    console.log('[P43] reset to VALIDATED_READY');
  }

  // STEP 2: Refresh ML credentials
  clearCredentialsCache(USER_ID, 'mercadolibre', 'production');
  const mlCreds = (await CredentialsManager.getCredentials(USER_ID, 'mercadolibre', 'production')) as Record<string, unknown> | null;
  const accessToken = String(mlCreds?.accessToken || mlCreds?.access_token || '').trim();
  const refreshToken = String(mlCreds?.refreshToken || mlCreds?.refresh_token || '').trim();
  const sellerId = String(mlCreds?.sellerId || mlCreds?.user_id || '').trim();
  if (!accessToken) { console.error('[P43] ABORT: no ML access token'); process.exit(1); }

  const mlService = new MercadoLibreService({
    accessToken, refreshToken, userId: sellerId,
    siteId: 'MLC', currency: 'CLP', language: 'es',
  });

  // Refresh token before publish
  try {
    const refreshed = await mlService.refreshAccessToken();
    console.log(`[P43] token refreshed (expiresIn=${refreshed.expiresIn}s)`);
    // Update credentials with fresh token
    await CredentialsManager.storeCredentials(USER_ID, 'mercadolibre', 'production', {
      ...mlCreds as any,
      accessToken: refreshed.accessToken,
    });
    clearCredentialsCache(USER_ID, 'mercadolibre', 'production');
  } catch (e: any) {
    console.warn(`[P43] token refresh warning: ${e.message} — proceeding with existing token`);
  }

  // STEP 3: Publish via MarketplaceService (reads asset pack, handles images)
  console.log('\n[P43] publishing via MarketplaceService...');
  const marketplaceService = new MarketplaceService();
  const publishRequest: PublishProductRequest = {
    productId: PRODUCT_ID,
    marketplace: 'mercadolibre',
    duplicateListing: true,
  };

  const publishResult = await marketplaceService.publishProduct(USER_ID, publishRequest, 'production');
  console.log('[P43] publish result:');
  console.log(JSON.stringify(publishResult, null, 2));

  const newListingId: string | undefined =
    (publishResult as any)?.listingId
    || (publishResult as any)?.externalId
    || (publishResult as any)?.id;

  if (!newListingId) {
    console.error('[P43] ABORT: no listing ID returned');
    process.exit(1);
  }
  console.log(`\n[P43] new listing: ${newListingId}`);

  // STEP 4: Poll status after 90s
  console.log('[P43] waiting 90s for ML async review...');
  await sleep(90000);

  // Refresh ML client after token refresh
  clearCredentialsCache(USER_ID, 'mercadolibre', 'production');
  const mlCreds2 = (await CredentialsManager.getCredentials(USER_ID, 'mercadolibre', 'production')) as Record<string, unknown> | null;
  const mlService2 = new MercadoLibreService({
    accessToken: String(mlCreds2?.accessToken || ''),
    refreshToken: String(mlCreds2?.refreshToken || ''),
    userId: sellerId, siteId: 'MLC', currency: 'CLP', language: 'es',
  });

  const check = await mlService2.getItem(newListingId) as any;
  console.log('\n[POST-PUBLISH STATUS]');
  console.log(JSON.stringify({
    id: check?.id,
    status: check?.status,
    health: check?.health,
    sub_status: check?.sub_status,
    permalink: check?.permalink,
    price: check?.price,
    currency_id: check?.currency_id,
    pictures: check?.pictures?.map((p: any) => ({ id: p.id })),
  }, null, 2));

  const finalStatus = check?.status;
  console.log('\n=== OUTCOME ===');
  if (finalStatus === 'active') {
    console.log('SUCCESS: listing ACTIVE');
  } else if (finalStatus === 'under_review') {
    console.log(`PARTIAL: listing UNDER_REVIEW (sub_status=${JSON.stringify(check?.sub_status)})`);
  } else {
    console.log(`ATTENTION: status=${finalStatus} sub_status=${JSON.stringify(check?.sub_status)}`);
  }
}

main()
  .then(() => { console.log('\n[P43] done'); })
  .catch(e => { console.error('[P43] FATAL', e?.message || e); process.exit(1); })
  .finally(() => prisma.$disconnect());
