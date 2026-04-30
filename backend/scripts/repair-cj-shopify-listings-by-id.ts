import { prisma } from '../src/config/database';
import { cjShopifyUsaReconciliationService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-reconciliation.service';

async function main() {
  const userId = Number(process.argv[2] || 1);
  const ids = process.argv.slice(3).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) {
    throw new Error('Usage: tsx scripts/repair-cj-shopify-listings-by-id.ts <userId> <listingId...>');
  }
  const listings = await prisma.cjShopifyUsaListing.findMany({
    where: { userId, id: { in: ids } },
    include: { product: true, variant: true },
  });
  const reconciled = await cjShopifyUsaReconciliationService.reconcileListings(userId, listings);
  console.log(JSON.stringify(reconciled.map((listing) => ({
    id: listing.id,
    status: listing.status,
    shopifyProductId: listing.shopifyProductId,
    shopifyVariantId: listing.shopifyVariantId,
    inventoryQuantity: listing.publishTruth?.shopify?.inventoryQuantity ?? null,
    reasons: listing.publishTruth?.reasons ?? [],
    lastError: listing.lastError ?? null,
  })), null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
