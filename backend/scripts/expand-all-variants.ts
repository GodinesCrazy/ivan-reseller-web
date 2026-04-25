/**
 * Script: expand-all-variants.ts
 * Expands all ACTIVE Shopify listings that have multiple CJ variants
 * into a single Shopify product with a proper variant picker.
 *
 * Run: npx ts-node scripts/expand-all-variants.ts
 */

import 'dotenv/config';
import { prisma } from '../src/config/database';
import { cjShopifyUsaPublishService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-publish.service';

async function main() {
  console.log('🔍 Finding ACTIVE listings with multiple CJ variants...\n');

  // Find one ACTIVE listing per productId where the product has >1 CJ variant
  const activeListings = await prisma.cjShopifyUsaListing.findMany({
    where: { status: 'ACTIVE', shopifyProductId: { not: null } },
    select: {
      id: true,
      userId: true,
      productId: true,
      shopifySku: true,
      product: {
        select: {
          title: true,
          cjProductId: true,
          variants: { select: { id: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  // Group by (userId, productId) — keep only first listing per product
  const seen = new Set<string>();
  const toExpand: typeof activeListings = [];

  for (const l of activeListings) {
    const key = `${l.userId}-${l.productId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (l.product.variants.length > 1) {
      toExpand.push(l);
    }
  }

  console.log(`Found ${toExpand.length} products to expand:\n`);
  toExpand.forEach((l) =>
    console.log(
      `  Listing #${l.id} | ${l.product.variants.length} variants | ${l.product.title.slice(0, 50)} | ${l.shopifySku}`,
    ),
  );
  console.log();

  let success = 0;
  let failed = 0;

  for (const listing of toExpand) {
    const label = `[${listing.id}] ${listing.product.title.slice(0, 40)}`;
    try {
      process.stdout.write(`→ Expanding ${label}... `);
      const result = await cjShopifyUsaPublishService.expandProductVariants({
        userId: listing.userId,
        listingId: listing.id,
      });
      console.log(`✓ ${result.message}`);
      success++;

      // Small delay to avoid Shopify rate limits
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ FAILED: ${msg}`);
      failed++;

      // Longer delay after errors
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log(`\n✅ Done. ${success} expanded, ${failed} failed.`);
}

main()
  .catch((e) => { console.error('Fatal:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
