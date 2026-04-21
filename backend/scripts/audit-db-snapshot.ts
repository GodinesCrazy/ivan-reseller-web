import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const productByStatus = await prisma.product.groupBy({
    by: ['status'],
    _count: { _all: true },
    orderBy: { status: 'asc' },
  });

  const listingByMarketplaceStatus = await prisma.marketplaceListing.groupBy({
    by: ['marketplace', 'status'],
    _count: { _all: true },
    orderBy: [{ marketplace: 'asc' }, { status: 'asc' }],
  });

  const orderByStatus = await prisma.order.groupBy({
    by: ['status'],
    _count: { _all: true },
    orderBy: { status: 'asc' },
  });

  const saleByEnvironmentStatus = await prisma.sale.groupBy({
    by: ['environment', 'status'],
    _count: { _all: true },
    orderBy: [{ environment: 'asc' }, { status: 'asc' }],
  });

  const apiCredentials = await prisma.apiCredential.groupBy({
    by: ['apiName', 'environment', 'scope', 'isActive'],
    _count: { _all: true },
    orderBy: [{ apiName: 'asc' }, { environment: 'asc' }],
  });

  const legacyLinkedListings = await prisma.marketplaceListing.count({
    where: {
      product: {
        status: 'LEGACY_UNVERIFIED',
      },
      status: {
        not: 'archived_legacy_artifact',
      },
    },
  });

  const archivedLegacyArtifacts = await prisma.marketplaceListing.count({
    where: {
      status: 'archived_legacy_artifact',
    },
  });

  const validatedReadyCount = await prisma.product.count({
    where: { status: 'VALIDATED_READY' },
  });

  const publishableCoverage = {
    totalProducts: await prisma.product.count(),
    withoutTargetCountry: await prisma.product.count({ where: { targetCountry: null } }),
    withoutShippingCost: await prisma.product.count({ where: { shippingCost: null } }),
    withoutImportTax: await prisma.product.count({ where: { importTax: null } }),
    withoutTotalCost: await prisma.product.count({ where: { totalCost: null } }),
    withoutAliExpressSku: await prisma.product.count({ where: { aliexpressSku: null } }),
  };

  const orderRisk = {
    manualFulfillmentRequired: await prisma.order.count({ where: { manualFulfillmentRequired: true } }),
    failedOrders: await prisma.order.count({ where: { status: 'FAILED' } }),
    blockedOrders: await prisma.order.count({ where: { status: 'FULFILLMENT_BLOCKED' } }),
    purchasingOrders: await prisma.order.count({ where: { status: 'PURCHASING' } }),
  };

  const lastRealFailedOrder = await prisma.order.findFirst({
    where: { status: 'FAILED' },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      paypalOrderId: true,
      errorMessage: true,
      failureReason: true,
      manualFulfillmentRequired: true,
      updatedAt: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        productByStatus,
        listingByMarketplaceStatus,
        orderByStatus,
        saleByEnvironmentStatus,
        apiCredentials,
        legacyLinkedListings,
        archivedLegacyArtifacts,
        validatedReadyCount,
        publishableCoverage,
        orderRisk,
        lastRealFailedOrder,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
