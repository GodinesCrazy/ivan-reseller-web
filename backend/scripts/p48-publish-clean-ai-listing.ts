/**
 * p48 — Publish a clean new ML listing for product 32722
 *
 * Context:
 * - Old listing MLC1911535343 is `inactive` (ML permanently locked it after under_review)
 * - Phase 0 AI bg removal is now working (cover_main.jpg = clean white bg, 1200×1200)
 * - Strategy: create a NEW listing using only the 2 AI-processed local images
 *   (NO raw AliExpress images → those triggered ML moderation last time)
 *
 * Steps:
 * 1. Mark old DB rows as superseded
 * 2. Get product data from DB
 * 3. Get ML credentials and create new listing via createListing
 * 4. Verify active status
 * 5. Update DB with new listing ID
 */
import '../src/config/env';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import MarketplaceService from '../src/services/marketplace.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';
import {
  autoGenerateSimpleProcessedPack,
  inspectMercadoLibreAssetPack,
  getCanonicalMercadoLibreAssetPackDir,
} from '../src/services/mercadolibre-image-remediation.service';
import fsp from 'fs/promises';

const PRODUCT_ID = 32722;
const USER_ID = 1;
const OLD_LISTING_ID = 'MLC1911535343';

const prisma = new PrismaClient();

function parseImageUrls(raw: any): string[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed.filter((u: any): u is string => typeof u === 'string' && u.startsWith('http'));
  } catch { /* ignore */ }
  return [];
}

async function main() {
  console.log(`\n[P48] === Publish clean AI listing for product ${PRODUCT_ID} ===\n`);

  // ── STEP 1: Mark old listing rows as superseded ────────────────────────────
  const oldRows = await prisma.marketplaceListing.findMany({
    where: { productId: PRODUCT_ID, marketplace: 'mercadolibre', NOT: { status: 'superseded' } },
  });
  if (oldRows.length > 0) {
    await prisma.marketplaceListing.updateMany({
      where: { id: { in: oldRows.map(r => r.id) } },
      data: { status: 'superseded' },
    });
    console.log(`[P48] Marked ${oldRows.length} old listing rows as superseded`);
  }

  // ── STEP 2: Get product data ───────────────────────────────────────────────
  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { id: true, title: true, images: true, productData: true, description: true, aliexpressPrice: true, userId: true },
  });
  if (!product) throw new Error(`Product ${PRODUCT_ID} not found`);

  const imageUrls = parseImageUrls(product.images);
  console.log(`[P48] Product: "${product.title?.substring(0, 55)}"`);
  console.log(`[P48] aliexpressPrice: ${product.aliexpressPrice}`);

  // ── STEP 3: Ensure AI-processed asset pack exists ─────────────────────────
  const rootDir = getCanonicalMercadoLibreAssetPackDir(PRODUCT_ID);
  const coverPath = path.join(rootDir, 'cover_main.jpg');
  let packNeedsRegen = false;
  try {
    await fsp.access(coverPath);
    console.log(`[P48] cover_main.jpg exists — reusing`);
  } catch {
    packNeedsRegen = true;
  }

  if (packNeedsRegen) {
    console.log(`[P48] Regenerating asset pack (Phase 0 AI bg removal)...`);
    await autoGenerateSimpleProcessedPack({
      productId: PRODUCT_ID,
      title: product.title,
      imageUrls,
      rootDir,
      listingId: OLD_LISTING_ID,
    });
  }

  const pack = await inspectMercadoLibreAssetPack({ productId: PRODUCT_ID });
  const approvedLocalPaths = pack.assets
    .filter(a => a.approvalState === 'approved' && a.localPath)
    .map(a => a.localPath!);

  console.log(`[P48] Local AI-processed images (${approvedLocalPaths.length}):`);
  approvedLocalPaths.forEach((p, i) => console.log(`  [${i}] ${p}`));

  if (approvedLocalPaths.length === 0) throw new Error('No approved local assets');

  // ── STEP 4: Get ML credentials ────────────────────────────────────────────
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
    console.log('[P48] token refreshed');
  } catch(e: any) { console.warn('[P48] token refresh failed:', e?.message); }
  const token = (mlSvc as any).credentials.accessToken as string;

  // ── STEP 5: Predict category ──────────────────────────────────────────────
  const pd = typeof product.productData === 'string'
    ? JSON.parse(product.productData || '{}')
    : product.productData || {};
  const categoryId: string = pd?.categoryId || pd?.preventivePublish?.categoryId || 'MLC3530';
  console.log(`[P48] categoryId: ${categoryId}`);

  // ── STEP 6: Calculate price ───────────────────────────────────────────────
  // Use stored price from productData or compute from aliexpressPrice
  const priceUsd: number = pd?.preventivePublish?.listingSalePriceUsd ||
    pd?.mlChileImageRemediation?.priceCLP ||
    (Number(product.aliexpressPrice || 0) * 2.5); // fallback 2.5x markup

  // Convert USD to CLP if needed (ML Chile uses CLP)
  // If price looks like CLP (>1000), use as-is. If USD (<100), multiply by ~950
  const priceCLP = priceUsd > 500 ? priceUsd : Math.round(priceUsd * 950);
  console.log(`[P48] price: ${priceCLP} CLP (source priceUsd=${priceUsd})`);

  // ── STEP 7: Create listing ────────────────────────────────────────────────
  console.log(`\n[P48] Creating new ML listing...`);
  const result = await mlSvc.createListing({
    title: product.title || 'Soporte Escritorio Teléfono Gatito Decorativo Minimalista',
    description: product.description || 'Soporte de escritorio decorativo con diseño de gatito. Material de alta calidad, elegante y funcional.',
    categoryId,
    price: priceCLP,
    quantity: 10,
    condition: 'new',
    images: approvedLocalPaths,
    shipping: { mode: 'me2', freeShipping: false, handlingTime: 25 },
    attributes: [
      { id: 'BRAND', value: 'Genérico' },
      { id: 'MODEL', value: 'Soporte Gatito' },
    ],
  });

  console.log(`\n[P48] createListing result:`);
  console.log(JSON.stringify({ success: result.success, itemId: result.itemId, status: result.status, error: result.error }, null, 2));

  if (!result.success || !result.itemId) {
    throw new Error(`createListing failed: ${result.error}`);
  }

  const newListingId = result.itemId;

  // ── STEP 8: Verify listing status via ML API ──────────────────────────────
  await new Promise(r => setTimeout(r, 2000));
  const statusResp = await axios.get(`https://api.mercadolibre.com/items/${newListingId}`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const liveStatus = statusResp.data.status;
  const liveSubStatus = statusResp.data.sub_status;
  const livePics = statusResp.data.pictures?.length;
  console.log(`\n[P48] Live status: ${liveStatus} | sub_status: ${JSON.stringify(liveSubStatus)} | pics: ${livePics}`);

  // ── STEP 9: Update DB with new listing ID ─────────────────────────────────
  await prisma.marketplaceListing.create({
    data: {
      productId: PRODUCT_ID,
      userId: USER_ID,
      marketplace: 'mercadolibre',
      listingId: newListingId,
      status: liveStatus === 'active' ? 'active' : liveStatus,
      publishedAt: new Date(),
    },
  });

  // Mark product as published
  await prisma.product.update({
    where: { id: PRODUCT_ID },
    data: { isPublished: true },
  });

  console.log(`\n[P48] DB updated — new listing ${newListingId} recorded`);

  if (liveStatus === 'active') {
    console.log(`\n[P48] ✅ SUCCESS — new listing ACTIVE`);
    console.log(`  URL: https://articulo.mercadolibre.cl/MLC-${newListingId.replace('MLC','')}`);
    console.log(`  ${livePics} images, status=${liveStatus}`);
  } else {
    console.log(`\n[P48] ⚠️  Status is ${liveStatus} — check seller center`);
    console.log(`  Seller center: https://www.mercadolibre.cl/anuncios`);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('[P48] ❌ FATAL:', e?.response?.data || e?.message || e);
  prisma.$disconnect();
  process.exit(1);
});
