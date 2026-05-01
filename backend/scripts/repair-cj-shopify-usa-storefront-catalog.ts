import { prisma } from '../src/config/database';
import { cjShopifyUsaCategorizationService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-categorization.service';
import { cjShopifyUsaPublishService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-publish.service';
import { cjShopifyUsaReconciliationService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-reconciliation.service';

async function main() {
  const userId = Number(process.argv[2] || 1);
  const execute = process.argv.includes('--execute');
  const categoriesOnly = process.argv.includes('--categories-only');
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1] ?? 250)) : 250;

  const listings = await prisma.cjShopifyUsaListing.findMany({
    where: {
      userId,
      status: { in: ['ACTIVE', 'RECONCILE_PENDING'] },
      shopifyProductId: { not: null },
    },
    include: { product: true, variant: true },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  const seenProducts = new Set<string>();
  let categorized = 0;
  let pausedNoStock = 0;
  let checked = 0;

  for (const listing of listings) {
    checked++;
    const title = listing.product?.title ?? String((listing.draftPayload as Record<string, unknown> | null)?.title ?? '');

    if (listing.shopifyProductId && !seenProducts.has(listing.shopifyProductId)) {
      seenProducts.add(listing.shopifyProductId);
      if (execute) {
        await cjShopifyUsaCategorizationService.assignProductToPetCollections({
          userId,
          shopifyProductId: listing.shopifyProductId,
          title,
        });
      }
      categorized++;
    }

    if (categoriesOnly) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }

    const [reconciled] = await cjShopifyUsaReconciliationService.reconcileListings(userId, [listing]);
    const inventory = reconciled?.publishTruth?.shopify?.inventoryQuantity;
    const confirmedLocalOutOfStock =
      listing.variant?.stockLastKnown != null &&
      Number(listing.variant.stockLastKnown) <= 0;
    if (
      execute &&
      listing.status !== 'PAUSED' &&
      listing.shopifyProductId &&
      inventory != null &&
      inventory <= 0 &&
      confirmedLocalOutOfStock
    ) {
      await cjShopifyUsaPublishService.pauseListing({ userId, listingId: listing.id });
      pausedNoStock++;
    }

    await new Promise((resolve) => setTimeout(resolve, 450));
  }

  console.log(JSON.stringify({
    mode: execute ? 'execute' : 'dry-run',
    checked,
    uniqueProductsSeen: seenProducts.size,
    productsCategorized: categorized,
    listingsPausedBecauseConfirmedNoStock: pausedNoStock,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
