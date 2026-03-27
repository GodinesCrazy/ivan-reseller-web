/**
 * Phase 8 — Catalog rebuild engine.
 * Freezes the legacy catalog and creates a new validated catalog from strict real-data validation only.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { CredentialsManager } from './credentials-manager.service';
import type { AliExpressAffiliateCredentials } from '../types/api-credentials.types';
import { aliexpressAffiliateAPIService, type AffiliateProduct } from './aliexpress-affiliate-api.service';
import { buildOptimizedSearchQuery } from './smart-supplier-selector.service';
import { isSmartwatchTitleForConstrainedCycle } from './smartwatch-constrained-cycle.utils';
import { prepareProductForSafePublishing, type PreventivePublishPreparationResult } from './pre-publish-validator.service';
import MarketplaceService, { type MarketplaceName } from './marketplace.service';

const STRICT_PRICE_MULTIPLIERS = [1.45, 1.6, 1.75, 1.9, 2.1] as const;
const DEFAULT_MAX_SEARCH_RESULTS = 20;
const DEFAULT_MAX_VALIDATED_PRODUCTS = 3;
const DEFAULT_MIN_SUPPLIER_SEARCH = 10;
const DEFAULT_MAX_PRICE_USD = 20;

export interface FreezeLegacyCatalogResult {
  frozenCount: number;
  previousApprovedCount: number;
  previousPublishedCount: number;
}

export interface StrictCatalogCandidateScan {
  productId: string;
  title: string;
  originalUrl: string;
  sourcePriceUsd: number;
  optimizedQuery: string;
  rejectionReason?: string;
  validated?: boolean;
  selectedListingPriceUsd?: number;
  supplierReliabilityScore?: number;
  validatedCountry?: string;
}

export interface ValidatedCatalogProductRecord {
  productId: number;
  title: string;
  validatedSupplierId: string;
  validatedSkuId?: string;
  validatedShippingCost: number;
  validatedCountry: string;
  realCost: number;
  realProfit: number;
  listingPriceUsd: number;
  supplierReliabilityScore: number;
  fallbackSuppliers: number;
}

export interface CatalogRebuildRunResult {
  freeze: FreezeLegacyCatalogResult;
  scanned: number;
  rejected: number;
  validated: number;
  supplierReliability: Array<{
    productId: number;
    title: string;
    score: number;
    fallbackSuppliers: number;
  }>;
  firstRealSuccessfulProduct: null;
  validatedProducts: ValidatedCatalogProductRecord[];
  rejectedProducts: StrictCatalogCandidateScan[];
  scannedProducts: StrictCatalogCandidateScan[];
  blockingIssues: string[];
}

export interface StrictCatalogSearchParams {
  userId: number;
  query: string;
  country: string;
  marketplace: MarketplaceName;
  category: 'smartwatch';
  maxPriceUsd?: number;
  maxSearchResults?: number;
  maxValidatedProducts?: number;
  minSupplierSearch?: number;
  environment?: 'sandbox' | 'production';
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeCountry(country: string): string {
  return (country || 'US').trim().toUpperCase() || 'US';
}

function buildAffiliateProductUrl(productId: string): string {
  return `https://www.aliexpress.com/item/${productId}.html`;
}

function uniqueImageUrls(urls: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!raw || typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || !/^https?:\/\//i.test(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

async function loadAffiliateService(userId: number) {
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
        } as AliExpressAffiliateCredentials)
      : null;

  const dbCreds =
    envCreds ??
    ((await CredentialsManager.getCredentials(
      userId,
      'aliexpress-affiliate',
      'production'
    )) as AliExpressAffiliateCredentials | null);

  if (!dbCreds?.appKey || !dbCreds?.appSecret) {
    throw new Error('AliExpress affiliate credentials not configured');
  }

  aliexpressAffiliateAPIService.setCredentials(dbCreds);
  return aliexpressAffiliateAPIService;
}

function matchesStrictCategory(category: 'smartwatch', title: string): boolean {
  if (category === 'smartwatch') {
    return (
      isSmartwatchTitleForConstrainedCycle(title) ||
      /\breloj(?:es)?\s+inteligente(?:s)?\b/i.test(title)
    );
  }
  return false;
}

async function findStrictPreparation(params: {
  userId: number;
  candidate: AffiliateProduct;
  country: string;
  marketplace: MarketplaceName;
  credentials: Record<string, unknown>;
}): Promise<{ preparation: PreventivePublishPreparationResult; listingPriceUsd: number } | null> {
  const sourcePrice = Number(params.candidate.salePrice || 0);
  if (!(sourcePrice > 0)) return null;

  for (const multiplier of STRICT_PRICE_MULTIPLIERS) {
    const listingPriceUsd = roundCurrency(sourcePrice * multiplier);
    try {
      const preparation = await prepareProductForSafePublishing({
        userId: params.userId,
        marketplace: params.marketplace,
        credentials: params.credentials,
        listingSalePrice: listingPriceUsd,
        product: {
          id: 0,
          title: params.candidate.productTitle,
          category: 'smartwatch',
          aliexpressUrl: buildAffiliateProductUrl(params.candidate.productId),
          aliexpressSku: null,
          aliexpressPrice: sourcePrice,
          importTax: 0,
          currency: params.candidate.currency || 'USD',
          targetCountry: params.country,
          shippingCost: null,
          productData: null,
        },
      });
      return { preparation, listingPriceUsd };
    } catch (error: any) {
      logger.info('[CATALOG-REBUILD] Candidate rejected at multiplier', {
        productId: params.candidate.productId,
        title: params.candidate.productTitle?.slice(0, 80),
        multiplier,
        reason: error?.message || String(error),
      });
    }
  }

  return null;
}

export async function freezeLegacyCatalog(userId?: number): Promise<FreezeLegacyCatalogResult> {
  const whereBase = userId ? { userId } : {};
  const previousApprovedCount = await prisma.product.count({
    where: { ...whereBase, status: 'APPROVED' },
  });
  const previousPublishedCount = await prisma.product.count({
    where: { ...whereBase, status: 'PUBLISHED' },
  });

  const freezeResult = await prisma.product.updateMany({
    where: {
      ...whereBase,
      status: { in: ['APPROVED', 'PUBLISHED'] },
    },
    data: {
      status: 'LEGACY_UNVERIFIED',
      isPublished: false,
      publishedAt: null,
    },
  });

  logger.warn('[CATALOG-REBUILD] Legacy catalog frozen', {
    userId: userId ?? 'all',
    frozenCount: freezeResult.count,
    previousApprovedCount,
    previousPublishedCount,
  });

  return {
    frozenCount: freezeResult.count,
    previousApprovedCount,
    previousPublishedCount,
  };
}

export async function searchProductsStrict(
  params: StrictCatalogSearchParams
): Promise<CatalogRebuildRunResult> {
  const country = normalizeCountry(params.country);
  const maxPriceUsd = params.maxPriceUsd ?? DEFAULT_MAX_PRICE_USD;
  const maxSearchResults = params.maxSearchResults ?? DEFAULT_MAX_SEARCH_RESULTS;
  const maxValidatedProducts = params.maxValidatedProducts ?? DEFAULT_MAX_VALIDATED_PRODUCTS;
  const minSupplierSearch = params.minSupplierSearch ?? DEFAULT_MIN_SUPPLIER_SEARCH;
  const optimizedQuery = buildOptimizedSearchQuery(params.query);

  const freeze = await freezeLegacyCatalog(params.userId);
  const blockingIssues: string[] = [];

  const marketplaceService = new MarketplaceService();
  const marketplaceCreds = await marketplaceService.getCredentials(
    params.userId,
    params.marketplace,
    params.environment || 'production'
  );
  if (!marketplaceCreds?.credentials || !marketplaceCreds.isActive || marketplaceCreds.issues?.length) {
    throw new Error(
      marketplaceCreds?.issues?.join('; ') ||
        `${params.marketplace} credentials not ready for strict catalog rebuild`
    );
  }

  const affiliate = await loadAffiliateService(params.userId);
  const searchResult = await affiliate.searchProducts({
    keywords: optimizedQuery.slice(0, 100),
    pageNo: 1,
    pageSize: maxSearchResults,
    shipToCountry: country,
    targetCurrency: 'USD',
    targetLanguage: country === 'CL' ? 'ES' : 'EN',
    maxSalePrice: maxPriceUsd,
    sort: 'LAST_VOLUME_DESC',
  });

  const candidates = searchResult.products || [];

  const scannedProducts: StrictCatalogCandidateScan[] = [];
  const rejectedProducts: StrictCatalogCandidateScan[] = [];
  const validatedProducts: ValidatedCatalogProductRecord[] = [];

  for (const candidate of candidates) {
    const baseScan: StrictCatalogCandidateScan = {
      productId: String(candidate.productId),
      title: candidate.productTitle,
      originalUrl: buildAffiliateProductUrl(String(candidate.productId)),
      sourcePriceUsd: roundCurrency(Number(candidate.salePrice || 0)),
      optimizedQuery,
    };
    scannedProducts.push(baseScan);

    const price = Number(candidate.salePrice || 0);
    if (!(price > 0)) {
      rejectedProducts.push({
        ...baseScan,
        rejectionReason: 'candidate price is missing or invalid',
      });
      continue;
    }
    if (price > maxPriceUsd) {
      rejectedProducts.push({
        ...baseScan,
        rejectionReason: `candidate price ${roundCurrency(price)} exceeds maxPriceUsd ${maxPriceUsd}`,
      });
      continue;
    }
    if (!matchesStrictCategory(params.category, candidate.productTitle || '')) {
      rejectedProducts.push({
        ...baseScan,
        rejectionReason: `candidate does not match strict category ${params.category}`,
      });
      continue;
    }

    if (validatedProducts.length >= maxValidatedProducts) {
      rejectedProducts.push({
        ...baseScan,
        rejectionReason: `validated product target ${maxValidatedProducts} already reached`,
      });
      continue;
    }

    const existing = await prisma.product.findFirst({
      where: {
        userId: params.userId,
        aliexpressUrl: {
          equals: buildAffiliateProductUrl(String(candidate.productId)),
          mode: 'insensitive',
        },
      },
      select: { id: true, status: true },
    });
    if (existing && existing.status === 'VALIDATED_READY') {
      rejectedProducts.push({
        ...baseScan,
        rejectionReason: `already stored as VALIDATED_READY (productId=${existing.id})`,
      });
      continue;
    }

    const prepared = await findStrictPreparation({
      userId: params.userId,
      candidate,
      country,
      marketplace: params.marketplace,
      credentials: marketplaceCreds.credentials as Record<string, unknown>,
    });

    if (!prepared) {
      rejectedProducts.push({
        ...baseScan,
        rejectionReason: 'candidate failed strict supplier/shipping/profit validation across all configured price multipliers',
      });
      continue;
    }

    const { preparation, listingPriceUsd } = prepared;
    if ((preparation.supplierAudit.searchedAlternatives || 0) < minSupplierSearch) {
      rejectedProducts.push({
        ...baseScan,
        rejectionReason: `supplier search coverage ${preparation.supplierAudit.searchedAlternatives} below minimum ${minSupplierSearch}`,
      });
      continue;
    }

    const supplier = preparation.selectedSupplier;
    const images = uniqueImageUrls([
      supplier.productMainImageUrl,
      candidate.productMainImageUrl,
      ...(candidate.productSmallImageUrls || []),
    ]);
    if (images.length === 0) {
      rejectedProducts.push({
        ...baseScan,
        rejectionReason: 'candidate has no usable image URLs',
      });
      continue;
    }

    const createData = {
      userId: params.userId,
      aliexpressUrl: supplier.productUrl,
      title: supplier.productTitle || candidate.productTitle,
      description: `Validated catalog rebuild candidate for ${country}. Strict preventive validation passed.`,
      aliexpressPrice: supplier.salePriceUsd,
      suggestedPrice: listingPriceUsd,
      finalPrice: listingPriceUsd,
      currency: 'USD',
      category: params.category,
      images: JSON.stringify(images),
      shippingCost: preparation.profitability.shippingUsd,
      importTax: preparation.profitability.importTaxUsd,
      totalCost: preparation.profitability.totalCostUsd,
      targetCountry: country,
      originCountry: 'CN',
      status: 'VALIDATED_READY',
      isPublished: false,
      supplierStock: supplier.stock,
      supplierStockCheckedAt: new Date(supplier.validatedAt),
      aliexpressSku: supplier.skuId || null,
      productData: JSON.stringify({
        preventivePublish: preparation.metadataPatch.preventivePublish,
        validatedCatalog: {
          rebuiltAt: new Date().toISOString(),
          validatedSupplierId: supplier.productId,
          validatedSkuId: supplier.skuId || null,
          validatedShippingCost: preparation.profitability.shippingUsd,
          validatedCountry: country,
          realCost: preparation.profitability.totalCostUsd,
          realProfit: preparation.profitability.netProfitUsd,
          listingPriceUsd,
          supplierReliabilityScore: preparation.supplierAudit.supplierReliabilityScore,
          fallbackSuppliers: preparation.fallbackSuppliers.map((item) => ({
            supplierId: item.productId,
            skuId: item.skuId || null,
            totalSupplierCostUsd: item.totalSupplierCostUsd,
            rating: item.rating,
            orderCount: item.orderCount,
          })),
        },
        strictDiscovery: {
          query: params.query,
          optimizedQuery,
          originalAffiliateProductId: candidate.productId,
          originalAffiliateUrl: buildAffiliateProductUrl(String(candidate.productId)),
          marketplace: params.marketplace,
          category: params.category,
        },
      }),
    };

    const created = await prisma.product.create({ data: createData as any });
    validatedProducts.push({
      productId: created.id,
      title: createData.title,
      validatedSupplierId: supplier.productId,
      validatedSkuId: supplier.skuId || undefined,
      validatedShippingCost: preparation.profitability.shippingUsd,
      validatedCountry: country,
      realCost: preparation.profitability.totalCostUsd,
      realProfit: preparation.profitability.netProfitUsd,
      listingPriceUsd,
      supplierReliabilityScore: preparation.supplierAudit.supplierReliabilityScore,
      fallbackSuppliers: preparation.fallbackSuppliers.length,
    });
  }

  if (validatedProducts.length === 0) {
    blockingIssues.push('No candidate reached VALIDATED_READY under strict preventive validation');
  }
  if (scannedProducts.length === 0) {
    blockingIssues.push('Affiliate search returned zero products for the strict query');
  }

  return {
    freeze,
    scanned: scannedProducts.length,
    rejected: rejectedProducts.length,
    validated: validatedProducts.length,
    supplierReliability: validatedProducts.map((item) => ({
      productId: item.productId,
      title: item.title,
      score: item.supplierReliabilityScore,
      fallbackSuppliers: item.fallbackSuppliers,
    })),
    firstRealSuccessfulProduct: null,
    validatedProducts,
    rejectedProducts,
    scannedProducts,
    blockingIssues,
  };
}

export default {
  freezeLegacyCatalog,
  searchProductsStrict,
};
