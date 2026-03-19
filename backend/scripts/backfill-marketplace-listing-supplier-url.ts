#!/usr/bin/env tsx
/**
 * Backfill MarketplaceListing.supplierUrl from Product.aliexpressUrl.
 * Run once after adding supplierUrl to marketplace_listings for existing rows
 * that have productId but null supplierUrl.
 *
 * Usage:
 *   cd backend && npx tsx scripts/backfill-marketplace-listing-supplier-url.ts
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main() {
  const { prisma } = await import('../src/config/database');

  console.log('\n[BACKFILL] MarketplaceListing.supplierUrl from Product.aliexpressUrl\n');

  const listings = await prisma.marketplaceListing.findMany({
    where: { supplierUrl: null, productId: { not: null } },
    select: { id: true, productId: true },
  });

  if (listings.length === 0) {
    console.log('No listings with null supplierUrl and non-null productId. Done.');
    process.exit(0);
  }

  const productIds = [...new Set(listings.map((l) => l.productId!))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, aliexpressUrl: { not: null } },
    select: { id: true, aliexpressUrl: true },
  });

  const urlByProductId = new Map<number, string>(
    products
      .map((p) => [(p.id as number), (p.aliexpressUrl || '').trim()] as const)
      .filter(([, u]) => u.length > 0)
  );

  let updated = 0;
  for (const l of listings) {
    const url = urlByProductId.get(l.productId!);
    if (url) {
      await prisma.marketplaceListing.update({
        where: { id: l.id },
        data: { supplierUrl: url },
      });
      updated++;
    }
  }

  console.log(`Listings with null supplierUrl: ${listings.length}`);
  console.log(`Updated with Product.aliexpressUrl: ${updated}`);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
