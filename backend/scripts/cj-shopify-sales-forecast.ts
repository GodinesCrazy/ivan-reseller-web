import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const USER_ID = Number(process.env.CJ_SHOPIFY_USA_FORECAST_USER_ID || '1');

function asNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function probabilityAtLeastOne(visitors: number, conversionRate: number): number {
  const expectedSales = visitors * conversionRate;
  return 1 - Math.exp(-expectedSales);
}

function formatPct(value: number): string {
  return `${round(value * 100, 1)}%`;
}

async function main() {
  const settings = await prisma.cjShopifyUsaAccountSettings.findFirst({
    where: { userId: USER_ID },
    select: {
      minCostUsd: true,
      minMarginPct: true,
      maxSellPriceUsd: true,
      maxShippingUsd: true,
      defaultPaymentFeePct: true,
      defaultPaymentFixedFeeUsd: true,
      shopifyStoreUrl: true,
    },
  });

  const [total, active, draft, publishing, failed, archived, orders, realOrders, priceStats] = await Promise.all([
    prisma.cjShopifyUsaListing.count({ where: { userId: USER_ID } }),
    prisma.cjShopifyUsaListing.count({ where: { userId: USER_ID, status: 'ACTIVE' } }),
    prisma.cjShopifyUsaListing.count({ where: { userId: USER_ID, status: 'DRAFT' } }),
    prisma.cjShopifyUsaListing.count({ where: { userId: USER_ID, status: 'PUBLISHING' } }),
    prisma.cjShopifyUsaListing.count({ where: { userId: USER_ID, status: 'FAILED' } }),
    prisma.cjShopifyUsaListing.count({ where: { userId: USER_ID, status: 'ARCHIVED' } }),
    prisma.cjShopifyUsaOrder.count({ where: { userId: USER_ID } }),
    prisma.cjShopifyUsaOrder.count({
      where: {
        userId: USER_ID,
        NOT: [
          { shopifyOrderId: { startsWith: 'TEST' } },
          { shopifyOrderId: { startsWith: 'test' } },
          { shopifyOrderId: { startsWith: 'DEMO' } },
          { shopifyOrderId: { startsWith: 'demo' } },
        ],
      },
    }),
    prisma.cjShopifyUsaListing.aggregate({
      where: { userId: USER_ID, status: 'ACTIVE' },
      _avg: { listedPriceUsd: true },
      _min: { listedPriceUsd: true },
      _max: { listedPriceUsd: true },
    }),
  ]);

  const catalogFactor = active >= 800 ? 1 : Math.max(0.2, active / 800);
  const scenarios = [
    { label: 'Ahora / sin canal aprobado', monthlyVisitors: 10, conversionRate: 0.005 },
    { label: 'Pinterest inicial', monthlyVisitors: 100, conversionRate: 0.01 },
    { label: 'Mes 2 orgánico bajo', monthlyVisitors: 350, conversionRate: 0.015 },
    { label: 'Mes 3 orgánico medio', monthlyVisitors: 1000, conversionRate: 0.02 },
    { label: 'Mes 4-6 con reseñas', monthlyVisitors: 3000, conversionRate: 0.025 },
  ].map((scenario) => {
    const adjustedVisitors = Math.round(scenario.monthlyVisitors * catalogFactor);
    const expectedSales = adjustedVisitors * scenario.conversionRate;
    return {
      ...scenario,
      catalogAdjustedVisitors: adjustedVisitors,
      expectedSales: round(expectedSales, 1),
      probabilityAtLeastOneSale: formatPct(probabilityAtLeastOne(adjustedVisitors, scenario.conversionRate)),
    };
  });

  const result = {
    generatedAt: new Date().toISOString(),
    userId: USER_ID,
    settings: {
      minCostUsd: asNumber(settings?.minCostUsd),
      minMarginPct: asNumber(settings?.minMarginPct),
      maxSellPriceUsd: asNumber(settings?.maxSellPriceUsd),
      maxShippingUsd: asNumber(settings?.maxShippingUsd),
      defaultPaymentFeePct: asNumber(settings?.defaultPaymentFeePct),
      defaultPaymentFixedFeeUsd: asNumber(settings?.defaultPaymentFixedFeeUsd),
      shopifyStoreUrl: settings?.shopifyStoreUrl ?? null,
    },
    catalog: {
      total,
      active,
      draft,
      publishing,
      failed,
      archived,
      catalogFactor: round(catalogFactor, 3),
    },
    orders: {
      total: orders,
      real: realOrders,
    },
    activePriceUsd: {
      avg: round(asNumber(priceStats._avg.listedPriceUsd)),
      min: round(asNumber(priceStats._min.listedPriceUsd)),
      max: round(asNumber(priceStats._max.listedPriceUsd)),
    },
    scenarios,
    nextActions: [
      publishing > 0
        ? `Reset or republish ${publishing} listings stuck in PUBLISHING after the publish failure fix.`
        : 'No listings are stuck in PUBLISHING.',
      draft > 0
        ? `Publish image-valid DRAFT listings in controlled batches until active catalog reaches 800.`
        : 'No DRAFT backlog remains.',
      realOrders === 0
        ? 'Prioritize traffic and trust setup: Pinterest catalog, Google Search Console, Judge.me reviews.'
        : 'Use real order data to replace assumed conversion rates.',
    ],
  };

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
