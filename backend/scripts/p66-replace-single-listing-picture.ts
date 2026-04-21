#!/usr/bin/env tsx
/**
 * P66 (unsafe): Single-picture replace can leave listing **paused** (e.g. out_of_stock / policy).
 * Prefer `p66-rebuild-supplier-catalog-pack` + `p49` with **distinct** cover + zoom-detail from one URL.
 * @deprecated for routine use — kept for forensic replay only.
 */
import 'dotenv/config';

import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { inspectMercadoLibreAssetPack } from '../src/services/mercadolibre-image-remediation.service';
import { MarketplaceService } from '../src/services/marketplace.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';
import { productService } from '../src/services/product.service';

async function main() {
  const productId = Number(process.argv[2] || 32690);
  const listingIdArg = String(process.argv[3] || 'MLC3786354420').trim();

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, userId: true, status: true, isPublished: true },
  });
  if (!product) throw new Error(`product_${productId}_not_found`);

  const listingRow = await prisma.marketplaceListing.findFirst({
    where: { productId, marketplace: 'mercadolibre', listingId: listingIdArg },
    orderBy: { updatedAt: 'desc' },
  });
  if (!listingRow?.listingId) throw new Error('listing_not_found');

  const pack = await inspectMercadoLibreAssetPack({ productId });
  const cover = pack.assets.find((a) => a.assetKey === 'cover_main' && a.localPath);
  if (!cover?.localPath || !fs.existsSync(cover.localPath)) {
    throw new Error('cover_main_missing');
  }

  const marketplaceService = new MarketplaceService();
  const credentials = await marketplaceService.getCredentials(product.userId, 'mercadolibre', 'production');
  if (!credentials?.isActive) throw new Error('ml_credentials_missing');

  const ml = new MercadoLibreService(credentials.credentials as any);
  const before = await ml.getItem(listingRow.listingId);

  const finalSnap = await ml.replaceListingPictures(listingRow.listingId, [cover.localPath]);

  await prisma.marketplaceListing.update({
    where: { id: listingRow.id },
    data: {
      status: finalSnap?.status || 'active',
      listingUrl: finalSnap?.permalink || listingRow.listingUrl,
      updatedAt: new Date(),
    },
  });

  if (String(finalSnap?.status).toLowerCase() === 'active' && !(finalSnap?.sub_status || []).length) {
    await productService.updateProductStatusSafely(productId, 'PUBLISHED', true, product.userId);
  }

  console.log(
    JSON.stringify(
      {
        productId,
        listingId: listingRow.listingId,
        mode: 'single_picture_only',
        beforePictureCount: before?.pictures?.length ?? 0,
        afterPictureCount: finalSnap?.pictures?.length ?? 0,
        pictureIdsAfter: (finalSnap?.pictures || []).map((p: any) => p.id),
        status: finalSnap?.status,
        sub_status: finalSnap?.sub_status,
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
