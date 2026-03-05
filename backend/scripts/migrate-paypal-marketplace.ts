/**
 * Migrates Sales with marketplace='paypal' to correct marketplace.
 * - If Order.paypalOrderId starts with ebay:, amazon:, mercadolibre: ? use that prefix
 * - Else infer from Product's MarketplaceListing
 * - Else set to 'checkout'
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../src/config/logger';

const prisma = new PrismaClient();

const VALID_MARKETPLACES = ['ebay', 'amazon', 'mercadolibre'] as const;

async function deriveMarketplace(
  orderId: string,
  productId: number,
  userId: number
): Promise<string> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { paypalOrderId: true },
  });
  const pid = order?.paypalOrderId?.trim();
  if (pid) {
    const prefix = pid.split(':')[0]?.toLowerCase();
    if (prefix && VALID_MARKETPLACES.includes(prefix as any)) {
      return prefix;
    }
  }
  const listing = await prisma.marketplaceListing.findFirst({
    where: { productId, userId },
    select: { marketplace: true },
  });
  if (listing?.marketplace && VALID_MARKETPLACES.includes(listing.marketplace as any)) {
    return listing.marketplace.toLowerCase();
  }
  return 'checkout';
}

async function migrate() {
  logger.info('[MIGRATE] Starting migrate-paypal-marketplace...');

  const sales = await prisma.sale.findMany({
    where: { marketplace: 'paypal' },
    select: { id: true, orderId: true, productId: true, userId: true },
  });

  if (sales.length === 0) {
    logger.info('[MIGRATE] No Sales with marketplace=paypal found.');
    await prisma.$disconnect();
    return;
  }

  logger.info(`[MIGRATE] Found ${sales.length} Sales with marketplace=paypal`);

  let updated = 0;
  for (const sale of sales) {
    const marketplace = await deriveMarketplace(sale.orderId, sale.productId, sale.userId);
    await prisma.sale.update({
      where: { id: sale.id },
      data: { marketplace },
    });
    updated++;
    logger.info(`[MIGRATE] Sale ${sale.id} (order ${sale.orderId}) ? marketplace=${marketplace}`);
  }

  logger.info(`[MIGRATE] Done. Updated ${updated} Sales.`);
}

migrate()
  .catch((e) => {
    logger.error('[MIGRATE] Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
