import { prisma } from '../src/config/database';
import { isStrictPublishReady } from '../src/utils/strict-publish-readiness';

type RuntimeStage =
  | 'discovery'
  | 'publish_readiness'
  | 'marketplace_order'
  | 'supplier_purchase'
  | 'released_funds'
  | 'realized_profit';

function isRealProductionOrderId(orderId: string | null | undefined): boolean {
  const value = String(orderId || '').trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  return !(
    lower.startsWith('test') ||
    lower.startsWith('mock') ||
    lower.startsWith('demo')
  );
}

async function main(): Promise<void> {
  const userIdArg = process.argv[2];
  const userId = userIdArg ? Number(userIdArg) : undefined;
  const userWhere = Number.isFinite(userId) ? { userId } : {};

  const candidateRows = await prisma.product.findMany({
    where: {
      ...userWhere,
      isPublished: false,
      OR: [
        { status: 'VALIDATED_READY' },
        { status: 'APPROVED' },
        { status: 'LEGACY_UNVERIFIED' },
      ],
    },
    select: {
      id: true,
      status: true,
      isPublished: true,
      targetCountry: true,
      shippingCost: true,
      importTax: true,
      totalCost: true,
      aliexpressSku: true,
    },
    take: 500,
    orderBy: { updatedAt: 'desc' },
  });

  const strictReadyCount = candidateRows.filter((row) => isStrictPublishReady(row)).length;

  const productionSales = await prisma.sale.findMany({
    where: {
      ...userWhere,
      environment: 'production',
      status: { in: ['DELIVERED', 'COMPLETED'] },
    },
    select: {
      orderId: true,
      payoutExecuted: true,
      status: true,
    },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });

  const commerciallyValidCompletedSales = productionSales.filter(
    (sale) => isRealProductionOrderId(sale.orderId) && sale.payoutExecuted === true,
  ).length;

  const purchasedOrders = await prisma.order.findMany({
    where: {
      ...userWhere,
      status: 'PURCHASED',
    },
    select: {
      id: true,
      title: true,
      productUrl: true,
      aliexpressOrderId: true,
    },
    take: 100,
    orderBy: { createdAt: 'desc' },
  });

  const realPurchasedOrders = purchasedOrders.filter((order) => {
    const title = String(order.title || '').toLowerCase();
    const url = String(order.productUrl || '');
    return (
      !!order.aliexpressOrderId &&
      url.includes('aliexpress.com/item/') &&
      !title.includes('test')
    );
  }).length;

  const blockers: Array<{ stage: RuntimeStage; blocker: string }> = [];

  if (strictReadyCount === 0) {
    blockers.push({
      stage: 'publish_readiness',
      blocker: 'No strict VALIDATED_READY candidates with destination, shipping, tax, total cost, and AliExpress SKU truth.',
    });
  }

  if (commerciallyValidCompletedSales === 0) {
    blockers.push({
      stage: 'released_funds',
      blocker: 'No commercially valid production sale with payout executed.',
    });
    blockers.push({
      stage: 'realized_profit',
      blocker: 'No production sale currently qualifies for realized-profit proof.',
    });
  }

  if (realPurchasedOrders === 0) {
    blockers.push({
      stage: 'supplier_purchase',
      blocker: 'No real PURCHASED order proves automatic supplier purchase on a non-test AliExpress item.',
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    scope: Number.isFinite(userId) ? { userId } : { userId: 'all' },
    strictReadyCount,
    candidateRowsScanned: candidateRows.length,
    commerciallyValidCompletedSales,
    productionCompletedSalesScanned: productionSales.length,
    realPurchasedOrders,
    purchasedOrdersScanned: purchasedOrders.length,
    blockers,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('[check-first-real-profit-readiness] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
