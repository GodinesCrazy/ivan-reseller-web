#!/usr/bin/env tsx
/**
 * p44 — Regenerar portada 1200×1200 y actualizar galería (6 imgs) en listing activo MLC1911535343
 *
 * Pasos:
 *   1. Bootstrap pack: regenera cover_main.jpg (1200×1200) + detail_mount_interface.jpg
 *   2. Corre remediación completa para obtener publishableImageInputs (2 pack + 4 raw = 6)
 *   3. Sube nuevas imágenes al listing activo via replace_pictures
 */
import 'dotenv/config';
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
    if (typeof parsed === 'string' && parsed.startsWith('http')) return [parsed];
  } catch { /* ignore */ }
  return [];
}

async function main() {
  console.log(`\n[P44] === cover + gallery upgrade for product ${PRODUCT_ID} / listing ${LISTING_ID} ===\n`);

  // 1. Fetch product
  const product = await prisma.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { id: true, title: true, images: true, productData: true, userId: true },
  });
  if (!product) throw new Error(`Product ${PRODUCT_ID} not found`);

  const imageUrls = parseImageUrls(product.images);
  console.log(`[P44] product: "${product.title?.substring(0, 50)}"`);
  console.log(`[P44] imageUrls found: ${imageUrls.length}`);
  if (imageUrls.length < 2) throw new Error(`Need ≥2 image URLs, found ${imageUrls.length}`);

  // 2. Bootstrap — regenerate cover_main.jpg (1200×1200 guaranteed by Phase B fix)
  const rootDir = getCanonicalMercadoLibreAssetPackDir(PRODUCT_ID);
  console.log(`[P44] STEP 1: bootstrapping image pack at ${rootDir}…`);
  const generated = await autoGenerateSimpleProcessedPack({
    productId: PRODUCT_ID,
    title: product.title,
    imageUrls,
    rootDir,
    listingId: LISTING_ID,
  });
  console.log(`[P44] bootstrap generated=${generated}`);

  // 3. Inspect pack
  const pack = await inspectMercadoLibreAssetPack({ productId: PRODUCT_ID });
  console.log(`[P44] packApproved=${pack.packApproved}, assets:`, pack.assets.map(a => `${a.assetKey}:${a.approvalState}`).join(', '));

  // 4. Run remediation pipeline to get publishableImageInputs (now includes raw gallery)
  console.log(`[P44] STEP 2: running remediation pipeline to resolve publishableImageInputs…`);
  const remediation = await runMercadoLibreImageRemediationPipeline({
    userId: USER_ID,
    productId: PRODUCT_ID,
    title: product.title,
    images: product.images,
    productData: product.productData,
  });
  console.log(`[P44] remediation decision=${remediation.decision}, publishSafe=${remediation.publishSafe}`);
  console.log(`[P44] publishableImageInputs (${remediation.publishableImageInputs.length}):`,
    remediation.publishableImageInputs.map(p => p.length > 80 ? p.substring(0, 80) + '…' : p));

  if (!remediation.publishSafe || remediation.publishableImageInputs.length === 0) {
    throw new Error(`Remediation not publishSafe or no inputs. blockingReasons: ${remediation.blockingReasons?.join(', ')}`);
  }

  // 5. Replace pictures on the active listing
  console.log(`\n[P44] STEP 3: replacing pictures on ${LISTING_ID} with ${remediation.publishableImageInputs.length} images…`);
  const marketplaceService = new MarketplaceService();
  const credsResult = await marketplaceService.getCredentials(USER_ID, 'mercadolibre', 'production');
  if (!credsResult?.isActive || !credsResult?.credentials?.accessToken) {
    throw new Error('ML credentials not found or inactive');
  }
  const mlService = new MercadoLibreService({
    ...credsResult.credentials,
    siteId: (credsResult.credentials as any).siteId || process.env.MERCADOLIBRE_SITE_ID || 'MLC',
  } as any);

  // Refresh token first
  try {
    const refreshed = await mlService.refreshAccessToken();
    (mlService as any).credentials.accessToken = refreshed.accessToken;
    console.log('[P44] ML token refreshed');
  } catch (e: any) {
    console.warn('[P44] token refresh failed, continuing:', e?.message);
  }

  const result = await mlService.replaceListingPictures(LISTING_ID, remediation.publishableImageInputs);
  console.log(`\n[P44] replace_pictures result:`);
  console.log(JSON.stringify(result, null, 2));

  if (result.pictures && result.pictures.length > 0) {
    console.log(`\n[P44] ✅ SUCCESS — ${result.pictures.length} images now on listing ${LISTING_ID}`);
    console.log(`[P44] status=${result.status}`);
  } else {
    console.log(`[P44] ⚠️  result has no pictures array — check ML API response above`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[P44] ❌ FATAL:', e);
  prisma.$disconnect();
  process.exit(1);
});
