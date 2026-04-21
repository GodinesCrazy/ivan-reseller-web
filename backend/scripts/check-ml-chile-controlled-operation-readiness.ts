import { prisma } from '../src/config/database';
import {
  buildMlChileIssueQueues,
  getMlChilePreSaleBlockers,
} from '../src/utils/ml-chile-issue-queues';
import {
  clearCredentialsCache,
  CredentialsManager,
} from '../src/services/credentials-manager.service';
import MarketplaceService from '../src/services/marketplace.service';
import {
  classifyMlChileAuthState,
  requiresMlChileOauthReauth,
} from '../src/utils/ml-chile-auth-truth';


function normalizeStatus(status: string | null | undefined): string {
  return String(status || '').trim().toUpperCase();
}

function isCommercialOrderId(orderId: string | null | undefined): boolean {
  const value = String(orderId || '').trim().toLowerCase();
  if (!value) return false;
  return !(
    value.startsWith('test') ||
    value.startsWith('mock') ||
    value.startsWith('demo')
  );
}

async function main() {
  const rawUserId = process.argv[2];
  const userId = rawUserId ? Number(rawUserId) : 1;
  const marketplaceService = new MarketplaceService();

  const [products, credentialCount, mlSales, mlOrders] = await Promise.all([
    prisma.product.findMany({
      where: {
        userId,
        status: {
          in: ['VALIDATED_READY', 'APPROVED', 'LEGACY_UNVERIFIED', 'PENDING', 'REJECTED'],
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
        isPublished: true,
        targetCountry: true,
        shippingCost: true,
        importTax: true,
        totalCost: true,
        aliexpressSku: true,
        finalPrice: true,
        category: true,
        productData: true,
        updatedAt: true,
      },
      take: 1000,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.apiCredential.count({
      where: {
        userId,
        apiName: 'mercadolibre',
        environment: 'production',
        isActive: true,
      },
    }),
    prisma.sale.findMany({
      where: {
        userId,
        marketplace: 'mercadolibre',
      },
      select: {
        id: true,
        orderId: true,
        status: true,
        environment: true,
        payoutExecuted: true,
        currency: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.order.findMany({
      where: {
        userId,
        paypalOrderId: {
          startsWith: 'mercadolibre:',
        },
      },
      select: {
        id: true,
        status: true,
        paypalOrderId: true,
        aliexpressOrderId: true,
        errorMessage: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  clearCredentialsCache(userId, 'mercadolibre', 'production');
  const initialMlCreds = (await CredentialsManager.getCredentials(
    userId,
    'mercadolibre',
    'production',
  )) as Record<string, unknown> | null;
  const initialHasAccessToken = Boolean(
    String(initialMlCreds?.accessToken || initialMlCreds?.access_token || '').trim(),
  );
  const initialHasRefreshToken = Boolean(
    String(initialMlCreds?.refreshToken || initialMlCreds?.refresh_token || '').trim(),
  );
  const runtimeCheck = await marketplaceService.testConnection(
    userId,
    'mercadolibre',
    'production',
  );
  clearCredentialsCache(userId, 'mercadolibre', 'production');
  const mlCreds = (await CredentialsManager.getCredentials(
    userId,
    'mercadolibre',
    'production',
  )) as Record<string, unknown> | null;
  const hasAccessToken = Boolean(String(mlCreds?.accessToken || mlCreds?.access_token || '').trim());
  const hasRefreshToken = Boolean(String(mlCreds?.refreshToken || mlCreds?.refresh_token || '').trim());
  const authState = classifyMlChileAuthState({
    credentialCount,
    hasAccessToken,
    hasRefreshToken,
  });
  const runtimeUsable = runtimeCheck.success;
  const oauthReauthRequired = runtimeUsable ? false : requiresMlChileOauthReauth(authState);

  const coverage = {
    totalScanned: products.length,
    targetCountryCl: 0,
    wrongOrMissingTargetCountry: 0,
    missingShippingCost: 0,
    missingImportTax: 0,
    missingTotalCost: 0,
    missingAliExpressSku: 0,
    strictMlChileReadyCount: 0,
  };

  const rankedCandidates = products.map((product) => {
    const blockers = getMlChilePreSaleBlockers(product);
    if (String(product.targetCountry || '').trim().toUpperCase() === 'CL') {
      coverage.targetCountryCl += 1;
    }
    if (blockers.includes('missing_target_country') || blockers.includes('target_country_not_cl')) {
      coverage.wrongOrMissingTargetCountry += 1;
    }

    if (product.shippingCost == null) coverage.missingShippingCost += 1;
    if (product.importTax == null) coverage.missingImportTax += 1;
    if (product.totalCost == null) coverage.missingTotalCost += 1;
    if (!String(product.aliexpressSku || '').trim()) coverage.missingAliExpressSku += 1;

    if (blockers.length === 0) {
      coverage.strictMlChileReadyCount += 1;
    }

    return {
      id: product.id,
      title: product.title,
      status: normalizeStatus(product.status),
      targetCountry: product.targetCountry,
      finalPrice: product.finalPrice,
        category: product.category,
        productData: product.productData,
        blockers: Array.from(new Set(blockers)),
      };
  });

  rankedCandidates.sort((a, b) => a.blockers.length - b.blockers.length);
  const bestNearValidCandidate = rankedCandidates.find((candidate) => candidate.blockers.length > 0) || null;
  const issueQueues = buildMlChileIssueQueues(
    products.map((product) => ({
      id: product.id,
      status: product.status,
      targetCountry: product.targetCountry,
      shippingCost: product.shippingCost,
      importTax: product.importTax,
      totalCost: product.totalCost,
      aliexpressSku: product.aliexpressSku,
      productData: product.productData,
    })),
    Object.fromEntries(
      products.map((product) => [
        product.id,
        {
          authBlocked: !runtimeUsable,
          oauthReauthRequired,
        },
      ]),
    ),
  );

  const mlSalesSummary = {
    total: mlSales.length,
    production: mlSales.filter((sale) => sale.environment === 'production').length,
    productionCommerciallyValidWithPayout: mlSales.filter(
      (sale) =>
        sale.environment === 'production' &&
        sale.payoutExecuted === true &&
        isCommercialOrderId(sale.orderId),
    ).length,
    byStatus: mlSales.reduce<Record<string, number>>((acc, sale) => {
      const key = `${sale.environment}:${sale.status}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };

  const mlOrdersSummary = {
    total: mlOrders.length,
    purchasedRealLooking: mlOrders.filter(
      (order) =>
        order.status === 'PURCHASED' &&
        !!order.aliexpressOrderId &&
        isCommercialOrderId(order.id),
    ).length,
    byStatus: mlOrders.reduce<Record<string, number>>((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {}),
  };

  const blockers: string[] = [];
  if (credentialCount === 0) blockers.push('mercadolibre_production_credentials_missing_or_inactive');
  if (!runtimeUsable) blockers.push('auth_blocked_ml_credentials_missing_tokens');
  if (coverage.strictMlChileReadyCount === 0) blockers.push('no_strict_validated_ready_candidate_for_ml_chile');
  if (coverage.targetCountryCl === 0) blockers.push('no_products_persisted_with_target_country_cl');
  if (mlSalesSummary.productionCommerciallyValidWithPayout === 0) blockers.push('no_ml_chile_released_funds_profit_proof');
  if (mlOrdersSummary.purchasedRealLooking === 0) blockers.push('no_real_mercadolibre_order_with_supplier_purchase_proof');

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        userId,
        credentialCount,
        initialHasAccessToken,
        initialHasRefreshToken,
        authState,
        hasAccessToken,
        hasRefreshToken,
        runtimeUsable,
        runtimeMessage: runtimeCheck.message,
        oauthReauthRequired,
        coverage,
        bestNearValidCandidate,
        issueQueues,
        mlSalesSummary,
        mlOrdersSummary,
        blockers,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('[check-ml-chile-controlled-operation-readiness] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
