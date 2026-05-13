import 'dotenv/config';
import { prisma } from '../src/config/database';
import { cjEbayOperationalResetService } from '../src/modules/cj-ebay/services/cj-ebay-operational-reset.service';

const userId = Number(process.env.REAL_CYCLE_USER_ID || process.env.CJ_EBAY_RESET_USER_ID || 1);
const execute = process.env.CJ_EBAY_RESET_CONFIRM === 'RESET_CJ_EBAY_USA';

async function main() {
  const listings = await prisma.cjEbayListing.findMany({
    where: { userId },
    select: {
      id: true,
      status: true,
      ebayOfferId: true,
      ebayListingId: true,
      listedPriceUsd: true,
      createdAt: true,
      product: { select: { title: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const counts = {
    automationRuns: await prisma.cjEbayAutomationRun.count({ where: { userId } }),
    opportunityCandidates: await prisma.cjEbayOpportunityCandidate.count({ where: { userId } }),
    opportunityRuns: await prisma.cjEbayOpportunityRun.count({ where: { userId } }),
    listings: listings.length,
    orders: await prisma.cjEbayOrder.count({ where: { userId } }),
    products: await prisma.cjEbayProduct.count({ where: { userId } }),
    evaluations: await prisma.cjEbayProductEvaluation.count({ where: { userId } }),
    shippingQuotes: await prisma.cjEbayShippingQuote.count({ where: { userId } }),
    alerts: await prisma.cjEbayAlert.count({ where: { userId } }),
    traces: await prisma.cjEbayExecutionTrace.count({ where: { userId } }),
  };

  console.log('[cj-ebay-reset] userId', userId);
  console.log('[cj-ebay-reset] execute', execute);
  console.log('[cj-ebay-reset] counts', counts);
  console.log('[cj-ebay-reset] listings', listings.map((listing) => ({
    id: listing.id,
    status: listing.status,
    ebayOfferId: listing.ebayOfferId,
    ebayListingId: listing.ebayListingId,
    title: listing.product?.title?.slice(0, 90) ?? null,
    listedPriceUsd: listing.listedPriceUsd?.toString() ?? null,
    createdAt: listing.createdAt.toISOString(),
  })));

  if (!execute) {
    console.log('[cj-ebay-reset] DRY RUN only. Set CJ_EBAY_RESET_CONFIRM=RESET_CJ_EBAY_USA to execute.');
    return;
  }

  const result = await cjEbayOperationalResetService.resetUserData(userId, { keepSettings: true });
  console.log('[cj-ebay-reset] result', result);
}

main()
  .catch((error) => {
    console.error('[cj-ebay-reset] FAILED', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
