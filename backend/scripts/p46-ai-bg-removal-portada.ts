/**
 * p46 — AI background removal portada para producto 32722
 * Genera cover_main.jpg con fondo blanco puro usando ONNX model local.
 * Luego sube las imágenes al listing activo.
 */
import '../src/config/env';
import { PrismaClient } from '@prisma/client';
import {
  autoGenerateSimpleProcessedPack,
  inspectMercadoLibreAssetPack,
  runMercadoLibreImageRemediationPipeline,
  getCanonicalMercadoLibreAssetPackDir,
} from '../src/services/mercadolibre-image-remediation.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';
import MarketplaceService from '../src/services/marketplace.service';

const PRODUCT_ID = 32722;
const LISTING_ID = 'MLC1911535343';
const USER_ID = 1;

const prisma = new PrismaClient();

function parseImageUrls(raw: any): string[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed.filter((u: any): u is string => typeof u === 'string' && u.startsWith('http'));
  } catch { /* ignore */ }
  return [];
}

async function main() {
  console.log(`\n[P46] === AI bg removal portada upgrade — product ${PRODUCT_ID} / listing ${LISTING_ID} ===\n`);

  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { id: true, title: true, images: true, productData: true, userId: true },
  });
  if (!product) throw new Error(`Product ${PRODUCT_ID} not found`);

  const imageUrls = parseImageUrls(product.images);
  console.log(`[P46] title: "${product.title?.substring(0, 55)}"`);
  console.log(`[P46] imageUrls: ${imageUrls.length}`);
  imageUrls.forEach((u, i) => console.log(`  [${i}] ${u.substring(0, 80)}`));

  // Delete stale cover to force fresh generation
  const rootDir = getCanonicalMercadoLibreAssetPackDir(PRODUCT_ID);
  const fs = await import('fs/promises');
  for (const f of ['cover_main.jpg', 'cover_main.png', 'ml-asset-pack.json']) {
    try { await fs.unlink(`${rootDir}/${f}`); console.log(`[P46] deleted stale ${f}`); } catch { /* ok */ }
  }

  console.log(`\n[P46] STEP 1: bootstrap (Phase 0 AI bg removal will run first)…`);
  console.log('[P46] Note: first run downloads ONNX models (~80MB), may take 1-2 min…\n');

  const generated = await autoGenerateSimpleProcessedPack({
    productId: PRODUCT_ID,
    title: product.title,
    imageUrls,
    rootDir,
    listingId: LISTING_ID,
  });
  console.log(`\n[P46] bootstrap generated=${generated}`);

  const pack = await inspectMercadoLibreAssetPack({ productId: PRODUCT_ID });
  console.log(`[P46] packApproved=${pack.packApproved}`);
  console.log(`[P46] assets:`, pack.assets.map(a => `${a.assetKey}:${a.approvalState}${a.notes ? ` (${a.notes.substring(0,60)})` : ''}`));

  console.log(`\n[P46] STEP 2: resolving publishableImageInputs…`);
  const remediation = await runMercadoLibreImageRemediationPipeline({
    userId: USER_ID,
    productId: PRODUCT_ID,
    title: product.title,
    images: product.images,
    productData: product.productData,
  });
  console.log(`[P46] publishSafe=${remediation.publishSafe}, count=${remediation.publishableImageInputs.length}`);
  remediation.publishableImageInputs.forEach((p, i) => console.log(`  [${i}] ${p.length > 80 ? p.substring(0,80) + '…' : p}`));

  if (!remediation.publishSafe || remediation.publishableImageInputs.length === 0) {
    throw new Error(`Not publishSafe. reasons: ${remediation.blockingReasons?.join(', ')}`);
  }

  console.log(`\n[P46] STEP 3: uploading ${remediation.publishableImageInputs.length} images to ${LISTING_ID}…`);
  const ms = new MarketplaceService();
  const creds = await ms.getCredentials(USER_ID, 'mercadolibre', 'production');
  if (!creds?.isActive || !creds?.credentials?.accessToken) throw new Error('ML credentials not found');

  const mlSvc = new MercadoLibreService({
    ...creds.credentials,
    siteId: (creds.credentials as any).siteId || 'MLC',
  } as any);
  try { const r = await mlSvc.refreshAccessToken(); (mlSvc as any).credentials.accessToken = r.accessToken; console.log('[P46] token refreshed'); } catch(e: any) { console.warn('[P46] token refresh failed:', e?.message); }

  const result = await mlSvc.replaceListingPictures(LISTING_ID, remediation.publishableImageInputs);
  console.log(`\n[P46] replace_pictures result:`);
  console.log(JSON.stringify({ status: result.status, pictureCount: result.pictures?.length, ids: result.pictures?.map((p: any) => p.id) }, null, 2));

  if (result.pictures?.length > 0) {
    console.log(`\n[P46] ✅ DONE — ${result.pictures.length} images on ${LISTING_ID}, status=${result.status}`);
  } else {
    console.log(`[P46] ⚠️  no pictures in response — check above`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('[P46] ❌ FATAL:', e?.message || e); prisma.$disconnect(); process.exit(1); });
