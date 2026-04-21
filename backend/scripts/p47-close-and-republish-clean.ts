/**
 * p47 — Close under_review listing and republish clean
 *
 * Problem: MLC1911535343 went under_review after p44 added raw AliExpress images
 * (ML moderation flagged them for possible watermarks/logos).
 *
 * Solution:
 * 1. Close MLC1911535343
 * 2. Regenerate asset pack with Phase 0 AI bg removal (now working)
 * 3. Republish with ONLY the 2 AI-processed local images (no raw AliExpress)
 * 4. Verify new listing is active
 */
import '../src/config/env';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fsp from 'fs/promises';
import MarketplaceService from '../src/services/marketplace.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';
import {
  autoGenerateSimpleProcessedPack,
  inspectMercadoLibreAssetPack,
  runMercadoLibreImageRemediationPipeline,
  getCanonicalMercadoLibreAssetPackDir,
} from '../src/services/mercadolibre-image-remediation.service';

const OLD_LISTING_ID = 'MLC1911535343';
const PRODUCT_ID = 32722;
const USER_ID = 1;

const prisma = new PrismaClient();

function parseImageUrls(raw: any): string[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed.filter((u: any): u is string => typeof u === 'string' && u.startsWith('http'));
  } catch { /* ignore */ }
  return [];
}

async function getTokenAndSvc() {
  const ms = new MarketplaceService();
  const creds = await ms.getCredentials(USER_ID, 'mercadolibre', 'production');
  if (!creds?.isActive || !creds?.credentials?.accessToken) throw new Error('ML credentials not found');
  const mlSvc = new MercadoLibreService({
    ...creds.credentials,
    siteId: (creds.credentials as any).siteId || 'MLC',
  } as any);
  try {
    const r = await mlSvc.refreshAccessToken();
    (mlSvc as any).credentials.accessToken = r.accessToken;
    console.log('[P47] token refreshed');
  } catch(e: any) { console.warn('[P47] token refresh failed:', e?.message); }
  const token = (mlSvc as any).credentials.accessToken as string;
  return { mlSvc, token };
}

async function main() {
  console.log(`\n[P47] === Close under_review listing + republish clean ===\n`);

  const { mlSvc, token } = await getTokenAndSvc();

  // ── STEP 0: Check current status ──────────────────────────────────────────
  const statusResp = await axios.get(`https://api.mercadolibre.com/items/${OLD_LISTING_ID}`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const currentStatus = statusResp.data.status;
  console.log(`[P47] Current status of ${OLD_LISTING_ID}: ${currentStatus}`);

  // ── STEP 1: Close the old listing ─────────────────────────────────────────
  if (currentStatus !== 'closed') {
    console.log(`[P47] Closing ${OLD_LISTING_ID}...`);
    try {
      await axios.put(
        `https://api.mercadolibre.com/items/${OLD_LISTING_ID}`,
        { status: 'closed' },
        { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } },
      );
      console.log(`[P47] ✅ ${OLD_LISTING_ID} closed`);
    } catch (e: any) {
      console.warn(`[P47] Close attempt error: ${e?.response?.data?.message || e?.message}`);
    }
    // Verify
    await new Promise(r => setTimeout(r, 2000));
    const verify = await axios.get(`https://api.mercadolibre.com/items/${OLD_LISTING_ID}`, {
      headers: { Authorization: 'Bearer ' + token },
    });
    console.log(`[P47] Status after close attempt: ${verify.data.status}`);
  } else {
    console.log(`[P47] Already closed.`);
  }

  // ── STEP 2: Regenerate asset pack with AI bg removal ──────────────────────
  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { id: true, title: true, images: true, productData: true, userId: true },
  });
  if (!product) throw new Error(`Product ${PRODUCT_ID} not found`);
  const imageUrls = parseImageUrls(product.images);

  const rootDir = getCanonicalMercadoLibreAssetPackDir(PRODUCT_ID);
  // Delete stale pack to force fresh generation with Phase 0 AI
  for (const f of ['cover_main.jpg', 'ml-asset-pack.json']) {
    try { await fsp.unlink(`${rootDir}/${f}`); console.log(`[P47] deleted stale ${f}`); } catch { /* ok */ }
  }

  console.log(`\n[P47] STEP 2: regenerating asset pack (Phase 0 AI bg removal)...`);
  const generated = await autoGenerateSimpleProcessedPack({
    productId: PRODUCT_ID,
    title: product.title,
    imageUrls,
    rootDir,
    listingId: OLD_LISTING_ID,
  });
  console.log(`[P47] bootstrap generated=${generated}`);

  const pack = await inspectMercadoLibreAssetPack({ productId: PRODUCT_ID });
  console.log(`[P47] packApproved=${pack.packApproved}`);
  console.log(`[P47] assets:`, pack.assets.map(a => `${a.assetKey}:${a.approvalState}`));

  // ── STEP 3: Build image list — ONLY local AI-processed files ──────────────
  const approvedLocalPaths = pack.assets
    .filter(a => a.approvalState === 'approved' && a.localPath)
    .map(a => a.localPath!);

  console.log(`\n[P47] STEP 3: publishableImageInputs (local only, NO raw AliExpress):`);
  approvedLocalPaths.forEach((p, i) => console.log(`  [${i}] ${p}`));

  if (approvedLocalPaths.length === 0) {
    throw new Error('No approved local assets — cannot publish');
  }

  // ── STEP 4: Republish product to get a new listing ────────────────────────
  console.log(`\n[P47] STEP 4: publishing product ${PRODUCT_ID} fresh to ML...`);

  // Use the marketplace service to publish (it handles ML API create)
  const marketplaceSvc = new MarketplaceService();

  // We'll use the ML service directly to create a new listing via PUT on an existing draft
  // or use replaceListingPictures on the closed listing to see if ML allows it
  // Actually: ML allows picture updates on closed listings. Try that first.
  const closedStatus = (await axios.get(`https://api.mercadolibre.com/items/${OLD_LISTING_ID}`, {
    headers: { Authorization: 'Bearer ' + token },
  })).data.status;

  if (closedStatus === 'closed' || closedStatus === 'inactive') {
    console.log(`[P47] Listing is ${closedStatus} — trying picture replacement...`);
    try {
      const result = await mlSvc.replaceListingPictures(OLD_LISTING_ID, approvedLocalPaths);
      console.log(`[P47] replace_pictures result: status=${result.status}, pics=${result.pictures?.length}`);

      // Now reactivate
      console.log(`[P47] Reactivating listing...`);
      await axios.put(
        `https://api.mercadolibre.com/items/${OLD_LISTING_ID}`,
        { status: 'active' },
        { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } },
      );

      await new Promise(r => setTimeout(r, 2000));
      const finalStatus = (await axios.get(`https://api.mercadolibre.com/items/${OLD_LISTING_ID}`, {
        headers: { Authorization: 'Bearer ' + token },
      })).data;

      console.log(`\n[P47] Final status: ${finalStatus.status} | sub_status: ${JSON.stringify(finalStatus.sub_status)} | pics: ${finalStatus.pictures?.length}`);
      if (finalStatus.status === 'active') {
        console.log(`\n[P47] ✅ DONE — ${OLD_LISTING_ID} is ACTIVE with ${finalStatus.pictures?.length} clean AI images`);
        console.log(`  https://www.mercadolibre.cl/p/MLC?productId=${PRODUCT_ID}`);
      } else {
        console.log(`[P47] ⚠️  Status is ${finalStatus.status} — may need manual action in ML seller center`);
      }
    } catch (e: any) {
      console.error(`[P47] replaceListingPictures on closed listing failed:`, e?.response?.data || e?.message);
      console.log(`\n[P47] Trying to reactivate first, then replace pictures...`);
      try {
        await axios.put(
          `https://api.mercadolibre.com/items/${OLD_LISTING_ID}`,
          { status: 'active' },
          { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } },
        );
        await new Promise(r => setTimeout(r, 3000));
        const activeResult = await mlSvc.replaceListingPictures(OLD_LISTING_ID, approvedLocalPaths);
        console.log(`[P47] replace_pictures after reactivate: status=${activeResult.status}, pics=${activeResult.pictures?.length}`);
        const finalStatus2 = (await axios.get(`https://api.mercadolibre.com/items/${OLD_LISTING_ID}`, {
          headers: { Authorization: 'Bearer ' + token },
        })).data;
        console.log(`[P47] Final: ${finalStatus2.status} | pics: ${finalStatus2.pictures?.length}`);
      } catch (e2: any) {
        console.error(`[P47] Second attempt also failed:`, e2?.response?.data || e2?.message);
      }
    }
  } else {
    console.log(`[P47] Status is ${closedStatus} — cannot proceed with picture replace on non-closed listing`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('[P47] ❌ FATAL:', e?.response?.data || e?.message || e); prisma.$disconnect(); process.exit(1); });
