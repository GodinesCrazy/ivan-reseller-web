import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { prisma } from '../src/config/database';
import { cjShopifyUsaReconciliationService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-reconciliation.service';

const OUTPUT_PATH = path.resolve(process.cwd(), 'cj-shopify-usa-live-truth-reconciliation.json');

async function main() {
  const userId = Number(process.env.CJ_SHOPIFY_USA_RECONCILE_USER_ID || '1');
  const execute = process.argv.includes('--execute');

  const listings = await prisma.cjShopifyUsaListing.findMany({
    where: { userId },
    include: {
      product: { select: { id: true, title: true, cjProductId: true } },
      variant: { select: { id: true, cjSku: true, cjVid: true } },
    },
    orderBy: { id: 'asc' },
  });

  const before = listings.map((listing) => ({
    listingId: listing.id,
    title: listing.product?.title ?? null,
    localStatus: listing.status,
    shopifyProductId: listing.shopifyProductId,
    shopifyVariantId: listing.shopifyVariantId,
    shopifyHandle: listing.shopifyHandle,
    quantity: listing.quantity,
    publishedAt: listing.publishedAt,
    lastSyncedAt: listing.lastSyncedAt,
    lastError: listing.lastError,
  }));

  if (!execute) {
    const output = {
      ok: true,
      mode: 'dry-run-local-snapshot',
      note: 'Run with --execute to fetch live Shopify Admin truth and persist reconciled listing status.',
      userId,
      listingCount: listings.length,
      before,
    };
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const reconciled = await cjShopifyUsaReconciliationService.reconcileListings(userId, listings);
  const after = reconciled.map((listing) => ({
    listingId: listing.id,
    title: listing.product?.title ?? null,
    beforeStatus: before.find((row) => row.listingId === listing.id)?.localStatus ?? null,
    afterStatus: listing.status,
    shopifyProductExists: listing.publishTruth.shopify.exists,
    shopifyAdminStatus: listing.publishTruth.shopify.adminStatus,
    publishedOnPublication: listing.publishTruth.shopify.publishedOnPublication,
    inventoryQuantity: listing.publishTruth.shopify.inventoryQuantity,
    handle: listing.shopifyHandle,
    buyerFacingVerified: listing.publishTruth.buyerFacingVerified,
    reasons: listing.publishTruth.reasons,
  }));

  const changed = after.filter((row) => row.beforeStatus !== row.afterStatus);
  const output = {
    ok: true,
    mode: 'execute',
    finishedAt: new Date().toISOString(),
    userId,
    reconciledListings: listings.length,
    changedListings: changed.length,
    beforeStatusCounts: before.reduce<Record<string, number>>((acc, row) => {
      acc[row.localStatus] = (acc[row.localStatus] ?? 0) + 1;
      return acc;
    }, {}),
    afterStatusCounts: after.reduce<Record<string, number>>((acc, row) => {
      acc[row.afterStatus] = (acc[row.afterStatus] ?? 0) + 1;
      return acc;
    }, {}),
    sampleBeforeVsAfter: after.slice(0, 12),
    changed,
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
