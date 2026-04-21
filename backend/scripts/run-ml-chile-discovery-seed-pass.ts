import { PrismaClient } from '@prisma/client';
import {
  persistPreventivePublishPreparation,
  prepareProductForSafePublishing,
} from '../src/services/pre-publish-validator.service';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import type { AliExpressDropshippingCredentials } from '../src/types/api-credentials.types';
import { aliexpressDropshippingAPIService } from '../src/services/aliexpress-dropshipping-api.service';
import { evaluateMlChileDiscoveryAdmission } from '../src/utils/ml-chile-discovery-admission';
import { evaluateMlChileSkuAdmission } from '../src/utils/ml-chile-cl-sku-admission';
import {
  deriveMlChileSeedListingPriceUsd,
  isMlChileSeedTitleSafe,
  selectMlChileSeedQueries,
  titleMatchesMlChileSeedQuery,
} from '../src/utils/ml-chile-seed-strategy';
import { getMlChilePreSaleBlockers } from '../src/utils/ml-chile-issue-queues';

const prisma = new PrismaClient();

type AffiliateProductShape = {
  productId: string;
  productTitle: string;
  salePrice?: number;
  evaluateScore?: number;
  evaluateRate?: number;
  volume?: number;
  promotionLink?: string;
  productDetailUrl?: string;
  productMainImageUrl?: string;
  shippingInfo?: {
    shipToCountry?: string;
  };
};

type SeedCandidate = {
  query: string;
  category: string;
  productId: string;
  productTitle: string;
  salePrice: number;
  rating: number;
  volume: number;
  productUrl: string;
  affiliateUrl?: string;
  productMainImageUrl?: string;
};

function toRatingFiveStar(evaluateScore?: number, evaluateRate?: number): number {
  const score = evaluateScore ?? evaluateRate ?? 0;
  if (!Number.isFinite(score)) return 0;
  if (score <= 5) return score;
  if (score <= 100) return score / 20;
  return 0;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapErrorToBlockerCodes(message: string): string[] {
  const normalized = message.toLowerCase();
  const blockers = new Set<string>();

  if (normalized.includes('target country')) blockers.add('missing_target_country_cl');
  if (normalized.includes('shipping cost')) blockers.add('missing_shipping_cost');
  if (normalized.includes('import tax')) blockers.add('missing_import_tax');
  if (normalized.includes('total cost') || normalized.includes('financial completeness')) {
    blockers.add('missing_total_cost');
  }
  if (normalized.includes('sku')) blockers.add('missing_stable_aliexpress_sku');
  if (normalized.includes('profit') || normalized.includes('margin')) blockers.add('later_strict_validation');
  if (blockers.size === 0) blockers.add('later_strict_validation');
  return Array.from(blockers);
}

async function loadAffiliateService(userId: number) {
  const { aliexpressAffiliateAPIService } = await import('../src/services/aliexpress-affiliate-api.service');
  const appKey = (process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim();
  const appSecret = (
    process.env.ALIEXPRESS_AFFILIATE_APP_SECRET ||
    process.env.ALIEXPRESS_APP_SECRET ||
    ''
  ).trim();

  const envCreds =
    appKey && appSecret
      ? ({
          appKey,
          appSecret,
          trackingId: (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim(),
          sandbox: false,
        } as any)
      : null;

  const dbCreds = envCreds ?? (await CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', 'production'));
  if (!dbCreds?.appKey || !dbCreds?.appSecret) {
    throw new Error('AliExpress affiliate credentials not configured');
  }

  aliexpressAffiliateAPIService.setCredentials(dbCreds);
  return aliexpressAffiliateAPIService;
}

async function loadDropshippingService(userId: number) {
  const creds = (await CredentialsManager.getCredentials(
    userId,
    'aliexpress-dropshipping',
    'production',
  )) as AliExpressDropshippingCredentials | null;

  if (!creds?.accessToken) {
    throw new Error('AliExpress Dropshipping production credentials are required for the ML Chile seed pass.');
  }

  aliexpressDropshippingAPIService.setCredentials(creds);
  return aliexpressDropshippingAPIService;
}

async function fetchSeedCandidates(userId: number, queries: ReturnType<typeof selectMlChileSeedQueries>) {
  const affiliate = await loadAffiliateService(userId);
  const candidates: SeedCandidate[] = [];
  const scannedByQuery: Record<string, number> = {};

  for (const seed of queries) {
    const search = await affiliate.searchProducts({
      keywords: seed.query,
      pageNo: 1,
      pageSize: 12,
      shipToCountry: 'CL',
      targetCurrency: 'USD',
      targetLanguage: 'ES',
    });

    const products = (search?.products ?? []) as AffiliateProductShape[];
    scannedByQuery[seed.query] = products.length;

    for (const product of products) {
      const title = String(product.productTitle || '').trim();
      const productId = String(product.productId || '').trim();
      const salePrice = toNumber(product.salePrice);
      if (!title || !productId || !isMlChileSeedTitleSafe(title)) continue;
      if (!titleMatchesMlChileSeedQuery(title, seed.query)) continue;
      if (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice > 20) continue;

      candidates.push({
        query: seed.query,
        category: seed.category,
        productId,
        productTitle: title,
        salePrice,
        rating: toRatingFiveStar(product.evaluateScore, product.evaluateRate),
        volume: Math.max(0, Math.trunc(toNumber(product.volume))),
        productUrl: `https://www.aliexpress.com/item/${productId}.html`,
        affiliateUrl: (product.promotionLink || product.productDetailUrl || '').trim() || undefined,
        productMainImageUrl: product.productMainImageUrl,
      });
    }
  }

  const deduped = new Map<string, SeedCandidate>();
  for (const candidate of candidates) {
    const existing = deduped.get(candidate.productId);
    if (!existing) {
      deduped.set(candidate.productId, candidate);
      continue;
    }
    const existingScore = existing.rating * 1000 + existing.volume;
    const nextScore = candidate.rating * 1000 + candidate.volume;
    if (nextScore > existingScore) deduped.set(candidate.productId, candidate);
  }

  return {
    candidates: Array.from(deduped.values()).sort((a, b) => {
      const scoreA = a.rating * 1000 + a.volume;
      const scoreB = b.rating * 1000 + b.volume;
      return scoreB - scoreA;
    }),
    scannedByQuery,
  };
}

async function upsertSeedProduct(params: {
  userId: number;
  candidate: SeedCandidate;
  admittedSkuId: string;
  shippingCostUsd: number;
}) {
  const { userId, candidate, admittedSkuId, shippingCostUsd } = params;
  const targetPrice = deriveMlChileSeedListingPriceUsd(candidate.salePrice + shippingCostUsd);
  const existing = await prisma.product.findFirst({
    where: {
      userId,
      aliexpressUrl: candidate.productUrl,
    },
  });

  const productData = JSON.stringify({
    p14ChileSeed: {
      query: candidate.query,
      category: candidate.category,
      affiliateUrl: candidate.affiliateUrl || null,
      rating: candidate.rating,
      volume: candidate.volume,
      productMainImageUrl: candidate.productMainImageUrl || null,
      createdAt: new Date().toISOString(),
    },
  });

  if (existing) {
    return prisma.product.update({
      where: { id: existing.id },
      data: {
        title: candidate.productTitle,
        aliexpressPrice: candidate.salePrice,
        suggestedPrice: targetPrice,
        finalPrice: targetPrice,
        currency: 'USD',
        category: candidate.category,
        images: JSON.stringify(candidate.productMainImageUrl ? [candidate.productMainImageUrl] : []),
        productData,
        targetCountry: 'CL',
        aliexpressSku: admittedSkuId,
        status: existing.status === 'VALIDATED_READY' ? existing.status : 'APPROVED',
      },
    });
  }

  return prisma.product.create({
    data: {
      userId,
      aliexpressUrl: candidate.productUrl,
      title: candidate.productTitle,
      description: null,
      aliexpressPrice: candidate.salePrice,
      suggestedPrice: targetPrice,
      finalPrice: targetPrice,
      currency: 'USD',
      category: candidate.category,
      images: JSON.stringify(candidate.productMainImageUrl ? [candidate.productMainImageUrl] : []),
      productData,
      targetCountry: 'CL',
      aliexpressSku: admittedSkuId,
      status: 'APPROVED',
      isPublished: false,
    },
  });
}

async function main() {
  const userId = Number(process.argv[2] || 1);
  const limit = Number(process.argv[3] || 4);
  const seedQueries = selectMlChileSeedQueries(limit);
  const ds = await loadDropshippingService(userId);
  const { candidates, scannedByQuery } = await fetchSeedCandidates(userId, seedQueries);

  const discoveryGateSummaryByCode: Record<string, number> = {};
  const clSkuGateSummaryByCode: Record<string, number> = {};
  const rejectionSummaryByCode: Record<string, number> = {};

  const admittedAfterChileSupportGate: Array<Record<string, unknown>> = [];
  const admittedAfterClSkuGate: Array<Record<string, unknown>> = [];
  const results: Array<Record<string, unknown>> = [];

  for (const candidate of candidates) {
    let info: any;
    try {
      info = await ds.getProductInfo(candidate.productId, {
        localCountry: 'CL',
        localLanguage: 'es',
      });
    } catch (error: any) {
      discoveryGateSummaryByCode.supplier_data_incomplete =
        (discoveryGateSummaryByCode.supplier_data_incomplete || 0) + 1;
      results.push({
        productId: candidate.productId,
        title: candidate.productTitle,
        query: candidate.query,
        outcome: 'rejected_before_enrichment',
        blockers: ['supplier_data_incomplete'],
        message: error?.message || String(error),
      });
      continue;
    }

    const discoveryAdmission = evaluateMlChileDiscoveryAdmission(info);
    discoveryGateSummaryByCode[discoveryAdmission.code] =
      (discoveryGateSummaryByCode[discoveryAdmission.code] || 0) + 1;

    if (!discoveryAdmission.admitted) {
      results.push({
        productId: candidate.productId,
        title: candidate.productTitle,
        query: candidate.query,
        outcome: 'rejected_before_enrichment',
        blockers: [discoveryAdmission.code],
        message: discoveryAdmission.reason,
      });
      continue;
    }

    admittedAfterChileSupportGate.push({
      productId: candidate.productId,
      title: candidate.productTitle,
      query: candidate.query,
      rating: candidate.rating,
      volume: candidate.volume,
    });

    const clSkuAdmission = evaluateMlChileSkuAdmission(info);
    clSkuGateSummaryByCode[clSkuAdmission.code] =
      (clSkuGateSummaryByCode[clSkuAdmission.code] || 0) + 1;

    if (!clSkuAdmission.admitted || !clSkuAdmission.skuId) {
      results.push({
        productId: candidate.productId,
        title: candidate.productTitle,
        query: candidate.query,
        outcome: 'rejected_before_enrichment',
        blockers: [clSkuAdmission.code],
        message: clSkuAdmission.reason,
      });
      continue;
    }

    const shippingCost = Math.min(
      ...(info.shippingInfo?.availableShippingMethods ?? [])
        .map((method: any) => toNumber(method.cost))
        .filter((cost: number) => cost >= 0),
    );

    admittedAfterClSkuGate.push({
      productId: candidate.productId,
      title: candidate.productTitle,
      query: candidate.query,
      admittedSkuId: clSkuAdmission.skuId,
      rating: candidate.rating,
      volume: candidate.volume,
    });

    const product = await upsertSeedProduct({
      userId,
      candidate,
      admittedSkuId: clSkuAdmission.skuId,
      shippingCostUsd: Number.isFinite(shippingCost) ? shippingCost : 0,
    });

    try {
      const preparation = await prepareProductForSafePublishing({
        userId,
        product,
        marketplace: 'mercadolibre',
        credentials: { siteId: 'MLC' },
        listingSalePrice: toNumber(product.finalPrice ?? product.suggestedPrice),
      });

      await persistPreventivePublishPreparation({
        productId: product.id,
        preparation,
      });

      await prisma.product.update({
        where: { id: product.id },
        data: {
          status: 'VALIDATED_READY',
          targetCountry: 'CL',
          aliexpressSku: clSkuAdmission.skuId,
        },
      });

      const updated = await prisma.product.findUnique({
        where: { id: product.id },
        select: {
          id: true,
          status: true,
          targetCountry: true,
          shippingCost: true,
          importTax: true,
          totalCost: true,
          aliexpressSku: true,
        },
      });

      const blockers = updated ? getMlChilePreSaleBlockers(updated) : ['later_strict_validation'];
      results.push({
        productId: product.id,
        sourceProductId: candidate.productId,
        title: candidate.productTitle,
        query: candidate.query,
        outcome: blockers.length === 0 ? 'validated' : 'near-valid',
        blockers,
      });
    } catch (error: any) {
      const blockers = mapErrorToBlockerCodes(error?.message || String(error));
      for (const blocker of blockers) {
        rejectionSummaryByCode[blocker] = (rejectionSummaryByCode[blocker] || 0) + 1;
      }
      results.push({
        productId: product.id,
        sourceProductId: candidate.productId,
        title: candidate.productTitle,
        query: candidate.query,
        outcome: 'rejected',
        blockers,
        message: error?.message || String(error),
      });
    }
  }

  const validated = results.filter((row) => row.outcome === 'validated').length;
  const nearValid = results.filter((row) => row.outcome === 'near-valid').length;
  const rejectedBeforeEnrichment = results.filter((row) => row.outcome === 'rejected_before_enrichment').length;
  const bestAdmittedCandidate = admittedAfterClSkuGate[0] || admittedAfterChileSupportGate[0] || null;
  const bestFailedAdmittedCandidate =
    results
      .filter((row) => row.outcome === 'rejected' || row.outcome === 'near-valid')
      .sort((a, b) => {
        const aCount = Array.isArray(a.blockers) ? a.blockers.length : 99;
        const bCount = Array.isArray(b.blockers) ? b.blockers.length : 99;
        return aCount - bCount;
      })[0] || null;

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        userId,
        seedStrategyUsed: {
          seedQueries,
          inventoryPath: 'affiliate_search_ship_to_cl -> dropshipping_get_product_info -> discovery_gate -> cl_sku_gate -> strict_ml_chile_funnel',
        },
        scannedByQuery,
        scannedAtDiscovery: candidates.length,
        admittedAfterChileSupportGate: admittedAfterChileSupportGate.length,
        admittedAfterClSkuGate: admittedAfterClSkuGate.length,
        rejectedBeforeEnrichment,
        nearValid,
        validated,
        discoveryGateSummaryByCode,
        clSkuGateSummaryByCode,
        rejectionSummaryByCode,
        bestAdmittedCandidate,
        bestFailedAdmittedCandidate,
        results,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('[run-ml-chile-discovery-seed-pass] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
