#!/usr/bin/env tsx
/**
 * P37 — Reset product 32722 to VALIDATED_READY, close MLC3828307770, publish.
 * Cover is already generated correctly (gray background, 1200x1200).
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

const LISTING_TO_CLOSE = 'MLC3828307770';
const PRODUCT_ID = 32722;
const USER_ID = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('[P37] === reset + close + publish ===');

  // Step 1: Reset product status to VALIDATED_READY
  await prisma.product.update({
    where: { id: PRODUCT_ID },
    data: { status: 'VALIDATED_READY' },
  });
  console.log('[P37] ✅ product status reset to VALIDATED_READY');

  clearCredentialsCache(USER_ID, 'mercadolibre', 'production');
  const mlCreds = (await CredentialsManager.getCredentials(USER_ID, 'mercadolibre', 'production')) as Record<string, unknown> | null;
  const accessToken = String(mlCreds?.accessToken || mlCreds?.access_token || '').trim();
  const refreshToken = String(mlCreds?.refreshToken || mlCreds?.refresh_token || '').trim();
  const sellerId = String(mlCreds?.sellerId || mlCreds?.user_id || '').trim();

  if (!accessToken) { console.error('[P37] ABORT: no ML token'); process.exit(1); }

  const mlService = new MercadoLibreService({ accessToken, refreshToken, userId: sellerId, siteId: 'MLC', currency: 'CLP', language: 'es' });

  // Step 2: Close current listing
  console.log(`\n[P37] STEP 2: closing ${LISTING_TO_CLOSE}…`);
  try {
    await mlService.closeListing(LISTING_TO_CLOSE);
    console.log(`[P37] ✅ closed ${LISTING_TO_CLOSE}`);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('closed') || msg.toLowerCase().includes('no puedes')) {
      console.log(`[P37] ⚠️  already closed: ${msg}`);
    } else {
      console.error(`[P37] ❌ close failed: ${msg}`);
      process.exit(1);
    }
  }
  try {
    await prisma.listing.updateMany({ where: { externalId: LISTING_TO_CLOSE }, data: { status: 'CLOSED', updatedAt: new Date() } });
  } catch { /* non-critical */ }

  // Step 3: Publish (cover_main.jpg already generated with gray background)
  console.log('\n[P37] STEP 3: publishing…');
  const marketplaceService = new MarketplaceService();
  const publishRequest: PublishProductRequest = { productId: PRODUCT_ID, marketplace: 'mercadolibre', duplicateListing: true };
  const publishResult = await marketplaceService.publishProduct(USER_ID, publishRequest, 'production');

  console.log('[P37] publish result:');
  console.log(JSON.stringify(publishResult, null, 2));

  const newListingId: string | undefined =
    (publishResult as any)?.listingId || (publishResult as any)?.externalId || (publishResult as any)?.id;
  if (!newListingId) { console.error('[P37] ABORT: no listing ID'); process.exit(1); }

  console.log(`\n[P37] ✅ New listing: ${newListingId}`);

  // Step 4: Poll after 120s
  console.log('\n[P37] STEP 4: waiting 120s for ML async review…');
  await sleep(120_000);

  console.log('[P37] polling…');
  try {
    const itemData = await mlService.getItem(newListingId) as any;
    const status = itemData?.status;
    console.log(`[P37] status=${status} health=${itemData?.health}`);
    if (status === 'active') {
      console.log('[P37] ✅ PASS — listing is active');
    } else {
      console.log(`[P37] ⚠️  status=${status}`);
    }
    console.log(JSON.stringify({ id: itemData?.id, status, sub_status: itemData?.sub_status, pictures: itemData?.pictures?.map((p: any) => ({ id: p.id, max_size: p.max_size })) }, null, 2));
  } catch (err: any) {
    console.error('[P37] poll failed:', err?.message);
  }
  console.log('\n[P37] === DONE ===');
}

main()
  .catch((err) => { console.error('[P37] FATAL:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
