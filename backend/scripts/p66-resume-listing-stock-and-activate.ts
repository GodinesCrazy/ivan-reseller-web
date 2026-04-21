#!/usr/bin/env tsx
/**
 * P66 recovery: set available_quantity > 0 and activate listing (listing-scoped).
 */
import 'dotenv/config';

import { prisma } from '../src/config/database';
import { MarketplaceService } from '../src/services/marketplace.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';
import { productService } from '../src/services/product.service';

async function main() {
  const productId = Number(process.argv[2] || 32690);
  const listingId = String(process.argv[3] || 'MLC3786354420').trim();
  const qty = Math.max(1, Number(process.argv[4] || 1));

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { userId: true },
  });
  if (!product) throw new Error('product_not_found');

  const ms = new MarketplaceService();
  const creds = await ms.getCredentials(product.userId, 'mercadolibre', 'production');
  if (!creds?.isActive) throw new Error('no_ml_creds');

  const ml = new MercadoLibreService(creds.credentials as any);
  await ml.updateListingQuantity(listingId, qty);
  const snap = await ml.activateListing(listingId);

  const row = await prisma.marketplaceListing.findFirst({
    where: { productId, marketplace: 'mercadolibre', listingId },
  });
  if (row) {
    await prisma.marketplaceListing.update({
      where: { id: row.id },
      data: {
        status: snap?.status || 'active',
        listingUrl: snap?.permalink || row.listingUrl,
        updatedAt: new Date(),
      },
    });
  }

  if (String(snap?.status).toLowerCase() === 'active' && !(snap?.sub_status || []).length) {
    await productService.updateProductStatusSafely(productId, 'PUBLISHED', true, product.userId);
  }

  console.log(
    JSON.stringify(
      {
        listingId,
        availableQuantitySet: qty,
        status: snap?.status,
        sub_status: snap?.sub_status,
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
