import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const USER_ID = Number(process.argv[2] || process.env.CJ_SHOPIFY_USA_DIAG_USER_ID || 1);

function asNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function toDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const today = toDateKey();
  const todayStart = new Date(`${today}T00:00:00.000Z`);

  const settings = await prisma.cjShopifyUsaAccountSettings.findUnique({
    where: { userId: USER_ID },
  });
  const minMarginPct = asNumber(settings?.minMarginPct ?? settings?.automationMinMarginPct ?? 10);

  const [
    cyclesToday,
    cycleSumsToday,
    listingStatusGroups,
    productCount,
    variantCount,
    evaluationStatusGroups,
    approvedEvaluations,
    approvedProducts,
    productsWithNoListings,
    productsWithAnyBusyListing,
    opportunityStatusGroups,
    recentTraces,
  ] = await Promise.all([
    prisma.cjShopifyUsaAutomationCycle.findMany({
      where: { userId: USER_ID, startedAt: { gte: todayStart } },
      orderBy: { startedAt: 'asc' },
      select: {
        id: true,
        status: true,
        startedAt: true,
        durationMs: true,
        productsScanned: true,
        productsApproved: true,
        draftsCreated: true,
        published: true,
        skipped: true,
        errors: true,
        events: true,
      },
    }),
    prisma.cjShopifyUsaAutomationCycle.aggregate({
      where: { userId: USER_ID, startedAt: { gte: todayStart } },
      _sum: { productsScanned: true, productsApproved: true, draftsCreated: true, published: true, skipped: true, errors: true },
    }),
    prisma.cjShopifyUsaListing.groupBy({
      by: ['status'],
      where: { userId: USER_ID },
      _count: { _all: true },
    }),
    prisma.cjShopifyUsaProduct.count({ where: { userId: USER_ID } }),
    prisma.cjShopifyUsaProductVariant.count({ where: { product: { userId: USER_ID } } }),
    prisma.cjShopifyUsaProductEvaluation.groupBy({
      by: ['decision'],
      where: { userId: USER_ID },
      _count: { _all: true },
    }),
    prisma.cjShopifyUsaProductEvaluation.count({
      where: {
        userId: USER_ID,
        decision: 'APPROVED',
        estimatedMarginPct: { gte: minMarginPct },
      },
    }),
    prisma.cjShopifyUsaProduct.count({
      where: {
        userId: USER_ID,
        evaluations: {
          some: {
            userId: USER_ID,
            decision: 'APPROVED',
            estimatedMarginPct: { gte: minMarginPct },
          },
        },
      },
    }),
    prisma.cjShopifyUsaProduct.count({
      where: {
        userId: USER_ID,
        listings: { none: { userId: USER_ID } },
      },
    }),
    prisma.cjShopifyUsaProduct.count({
      where: {
        userId: USER_ID,
        listings: {
          some: {
            userId: USER_ID,
            status: { in: ['ACTIVE', 'DRAFT', 'PUBLISHING', 'RECONCILE_PENDING'] },
          },
        },
      },
    }),
    prisma.cjShopifyUsaOpportunityCandidate.groupBy({
      by: ['status'],
      where: { userId: USER_ID },
      _count: { _all: true },
    }),
    prisma.cjShopifyUsaExecutionTrace.findMany({
      where: { userId: USER_ID, createdAt: { gte: todayStart } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { createdAt: true, step: true, message: true, meta: true },
    }),
  ]);

  const readyToPublishProducts = await prisma.cjShopifyUsaProduct.findMany({
    where: {
      userId: USER_ID,
      evaluations: {
        some: {
          userId: USER_ID,
          decision: 'APPROVED',
          estimatedMarginPct: { gte: minMarginPct },
        },
      },
      listings: {
        none: {
          userId: USER_ID,
          status: { in: ['ACTIVE', 'DRAFT', 'PUBLISHING', 'RECONCILE_PENDING'] },
        },
      },
      variants: {
        some: {
          unitCostUsd: { gt: 0 },
          stockLastKnown: { gt: 0 },
        },
      },
    },
    select: {
      id: true,
      cjProductId: true,
      title: true,
      evaluations: {
        where: { decision: 'APPROVED' },
        orderBy: { estimatedMarginPct: 'desc' },
        take: 1,
        select: { estimatedMarginPct: true, evaluatedAt: true },
      },
      variants: {
        where: { unitCostUsd: { gt: 0 }, stockLastKnown: { gt: 0 } },
        take: 1,
        select: { cjSku: true, stockLastKnown: true, unitCostUsd: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  const productsNoListingsWithApproved = await prisma.cjShopifyUsaProduct.count({
    where: {
      userId: USER_ID,
      listings: { none: { userId: USER_ID } },
      evaluations: {
        some: {
          userId: USER_ID,
          decision: 'APPROVED',
          estimatedMarginPct: { gte: minMarginPct },
        },
      },
    },
  });

  const productsNoListingsWithoutEvaluations = await prisma.cjShopifyUsaProduct.count({
    where: {
      userId: USER_ID,
      listings: { none: { userId: USER_ID } },
      evaluations: { none: { userId: USER_ID } },
    },
  });

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    userId: USER_ID,
    settings: settings ? {
      automationEnabled: settings.automationEnabled,
      automationState: settings.automationState,
      automationIntervalHours: settings.automationIntervalHours,
      automationMaxDailyPublish: settings.automationMaxDailyPublish,
      automationMaxPerCycle: settings.automationMaxPerCycle,
      automationDailyPublishCount: settings.automationDailyPublishCount,
      automationDailyCountDate: settings.automationDailyCountDate,
      minMarginPct,
      minCostUsd: asNumber(settings.minCostUsd),
      maxShippingUsd: asNumber(settings.maxShippingUsd),
      maxSellPriceUsd: asNumber(settings.maxSellPriceUsd),
    } : null,
    today: {
      dateKey: today,
      cycles: cyclesToday.map((cycle) => ({
        id: cycle.id,
        status: cycle.status,
        startedAt: cycle.startedAt,
        durationMs: cycle.durationMs,
        productsScanned: cycle.productsScanned,
        productsApproved: cycle.productsApproved,
        draftsCreated: cycle.draftsCreated,
        published: cycle.published,
        skipped: cycle.skipped,
        errors: cycle.errors,
        lastEvents: Array.isArray(cycle.events) ? cycle.events.slice(-5) : [],
      })),
      sums: cycleSumsToday._sum,
    },
    database: {
      products: productCount,
      variants: variantCount,
      listingsByStatus: Object.fromEntries(listingStatusGroups.map((row) => [row.status, row._count._all])),
      evaluationsByDecision: Object.fromEntries(evaluationStatusGroups.map((row) => [row.decision, row._count._all])),
      approvedEvaluationsAtCurrentMargin: approvedEvaluations,
      approvedProductsAtCurrentMargin: approvedProducts,
      productsWithNoListings,
      productsNoListingsWithApprovedAtCurrentMargin: productsNoListingsWithApproved,
      productsNoListingsWithoutEvaluations,
      productsWithBusyListings: productsWithAnyBusyListing,
      opportunityCandidatesByStatus: Object.fromEntries(opportunityStatusGroups.map((row) => [row.status, row._count._all])),
    },
    readyToPublishSample: readyToPublishProducts.map((product) => ({
      id: product.id,
      cjProductId: product.cjProductId,
      title: product.title,
      bestMarginPct: asNumber(product.evaluations[0]?.estimatedMarginPct),
      evaluatedAt: product.evaluations[0]?.evaluatedAt,
      variant: product.variants[0] ? {
        sku: product.variants[0].cjSku,
        stock: product.variants[0].stockLastKnown,
        costUsd: asNumber(product.variants[0].unitCostUsd),
      } : null,
    })),
    recentTraces,
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
