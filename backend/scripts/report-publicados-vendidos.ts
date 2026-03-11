#!/usr/bin/env tsx
/**
 * Report: publicados y vendidos por portal (ebay, mercadolibre, amazon)
 */
import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';
import { prisma } from '../src/config/database';

config({ path: path.join(process.cwd(), '.env.local'), override: true });
config({ path: path.join(process.cwd(), '.env'), override: true });

async function main() {
  const [listings, sales] = await Promise.all([
    prisma.marketplaceListing.groupBy({
      by: ['marketplace'],
      _count: { id: true },
    }),
    prisma.sale.groupBy({
      by: ['marketplace'],
      _count: { id: true },
    }),
  ]);

  const listingsByMp: Record<string, number> = {};
  for (const l of listings) {
    const key = l.marketplace.toLowerCase();
    listingsByMp[key] = l._count.id;
  }
  const totalListings = Object.values(listingsByMp).reduce((a, b) => a + b, 0);

  const salesByMp: Record<string, number> = {};
  for (const s of sales) {
    const key = s.marketplace.toLowerCase();
    salesByMp[key] = s._count.id;
  }
  const totalSales = Object.values(salesByMp).reduce((a, b) => a + b, 0);

  console.log('\n--- Publicados por portal ---');
  console.log(`Total: ${totalListings}`);
  for (const [mp, count] of Object.entries(listingsByMp).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${mp}: ${count}`);
  }

  console.log('\n--- Vendidos por portal ---');
  console.log(`Total: ${totalSales}`);
  for (const [mp, count] of Object.entries(salesByMp).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${mp}: ${count}`);
  }
  console.log('');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
