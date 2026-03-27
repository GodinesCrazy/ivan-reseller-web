import { prisma } from '../config/database';
import logger from '../config/logger';
import { CredentialsManager } from './credentials-manager.service';
import type { AliExpressAffiliateCredentials } from '../types/api-credentials.types';
import { aliexpressAffiliateAPIService, type AffiliateProduct } from './aliexpress-affiliate-api.service';
import { buildOptimizedSearchQuery, titleSimilarityRatio } from './smart-supplier-selector.service';
import { prepareProductForSafePublishing, type PreventivePublishPreparationResult } from './pre-publish-validator.service';
import MarketplaceService, { type MarketplaceName } from './marketplace.service';
import { freezeLegacyCatalog, type FreezeLegacyCatalogResult } from './catalog-rebuild.service';
import { getMarketplaceContext, type MarketplaceContext } from './marketplace-context.service';
import {
  classifySupplierValidationReason,
  type SupplierValidationReasonCode,
} from './supplier-validation-reason.service';
import { findAlternativeWithStock } from './aliexpress-alternative-product.service';

const STRICT_PRICE_MULTIPLIERS = [1.45, 1.6, 1.75, 1.9, 2.1] as const;
const DEFAULT_MAX_PRICE_USD = 20;
const DEFAULT_MAX_SEARCH_RESULTS = 20;
const DEFAULT_MIN_SUPPLIER_SEARCH = 10;

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'for',
  'with',
  'from',
  'to',
  'in',
  'on',
  'of',
  'at',
  'by',
  'new',
  'hot',
  'sale',
  'free',
  'best',
  'top',
]);

const QUERY_LANGUAGE_ALIASES: Record<string, string[]> = {
  'cell phone holder': ['cell phone holder', 'phone holder', 'soporte telefono', 'soporte celular', 'soporte movil'],
  'phone stand': ['phone stand', 'telefono soporte', 'soporte telefono', 'soporte celular', 'phone holder'],
  'led light': ['led light', 'luz led', 'lampara led', 'led lamp'],
  'usb light': ['usb light', 'luz usb', 'lampara usb', 'usb lamp'],
  'cable organizer': ['cable organizer', 'organizador cables', 'organizador de cables', 'recoge cables'],
  'kitchen organizer': ['kitchen organizer', 'organizador cocina', 'organizador de cocina', 'almacenamiento cocina'],
  'adhesive cable clips': ['adhesive cable clips', 'cable clips', 'wire clips', 'cable holders'],
  'silicone cable ties': ['silicone cable ties', 'cable ties', 'reusable cable ties', 'silicone ties'],
  'webcam cover': ['webcam cover', 'camera privacy cover', 'webcam slider', 'laptop webcam cover'],
  'screen cleaning cloth': ['screen cleaning cloth', 'microfiber cloth', 'screen cleaner cloth', 'cleaning cloth'],
  'adhesive wall hook': ['adhesive wall hook', 'wall hook', 'sticky hook', 'self adhesive hook'],
};

const GENERIC_BLOCKED_TERMS = [
  'anime',
  'simpsons',
  'sanrio',
  'hello kitty',
  'miffy',
  'cartoon',
  'cosplay',
  'toy',
  'plush',
];

interface FirstProductQueryProfile {
  searchQuery: string;
  requiredAny: string[];
  requiredAll?: string[];
  blockedTerms?: string[];
  preferredMaxSourcePriceUsd?: number;
}

const FIRST_PRODUCT_QUERY_PROFILES: Record<string, FirstProductQueryProfile> = {
  'cell phone holder': {
    searchQuery: 'phone holder stand',
    requiredAny: ['phone', 'holder', 'stand', 'magnetic', 'magsafe', 'suction'],
    requiredAll: ['phone'],
    blockedTerms: ['lamp', 'projector', 'therapy', 'tripod', 'bedside', 'table lamp', 'light panel'],
    preferredMaxSourcePriceUsd: 12,
  },
  'phone stand': {
    searchQuery: 'desk phone stand',
    requiredAny: ['phone', 'stand', 'holder', 'desktop', 'desk'],
    requiredAll: ['phone'],
    blockedTerms: ['lamp', 'projector', 'therapy', 'tripod', 'bedside', 'table lamp', 'panel'],
    preferredMaxSourcePriceUsd: 12,
  },
  'cable organizer': {
    searchQuery: 'cable organizer clip',
    requiredAny: ['cable', 'organizer', 'clip', 'holder', 'management'],
    requiredAll: ['cable'],
    blockedTerms: ['marine', 'throttle', 'steering', 'antenna', 'psu', 'rack', 'caravan', 'towel', 'adapter'],
    preferredMaxSourcePriceUsd: 10,
  },
  'usb light': {
    searchQuery: 'usb light lamp',
    requiredAny: ['usb', 'light', 'lamp'],
    requiredAll: ['usb'],
    blockedTerms: ['therapy', 'panel', 'outdoor flood', 'ceiling'],
    preferredMaxSourcePriceUsd: 10,
  },
  'mouse pad': {
    searchQuery: 'mouse pad desk mat',
    requiredAny: ['mouse', 'pad', 'desk', 'mat'],
    requiredAll: ['mouse'],
    blockedTerms: ['chair', 'table', 'lamp', 'keyboard tray'],
    preferredMaxSourcePriceUsd: 10,
  },
  'desk organizer': {
    searchQuery: 'desk organizer holder',
    requiredAny: ['desk', 'organizer', 'holder', 'pen', 'storage'],
    requiredAll: ['desk'],
    blockedTerms: ['wardrobe', 'kitchen', 'car', 'bathroom', 'drawer slide'],
    preferredMaxSourcePriceUsd: 12,
  },
  'adhesive cable clips': {
    searchQuery: 'adhesive cable clips',
    requiredAny: ['cable', 'clips', 'clip', 'wire', 'holder', 'adhesive'],
    requiredAll: ['cable'],
    blockedTerms: ['microphone', 'marine', 'steering', 'wireless', 'beltpack'],
    preferredMaxSourcePriceUsd: 8,
  },
  'silicone cable ties': {
    searchQuery: 'silicone cable ties',
    requiredAny: ['cable', 'tie', 'ties', 'silicone', 'reusable'],
    requiredAll: ['cable'],
    blockedTerms: ['bracelet', 'toy', 'phone case', 'strap watch'],
    preferredMaxSourcePriceUsd: 6,
  },
  'webcam cover': {
    searchQuery: 'webcam cover slider',
    requiredAny: ['webcam', 'camera', 'privacy', 'cover', 'slider'],
    requiredAll: ['cover'],
    blockedTerms: ['lens protector', 'ring light', 'phone case', 'tripod'],
    preferredMaxSourcePriceUsd: 5,
  },
  'screen cleaning cloth': {
    searchQuery: 'microfiber screen cleaning cloth',
    requiredAny: ['screen', 'cleaning', 'cloth', 'microfiber'],
    requiredAll: ['cloth'],
    blockedTerms: ['towel', 'blanket', 'mop', 'curtain'],
    preferredMaxSourcePriceUsd: 5,
  },
  'adhesive wall hook': {
    searchQuery: 'adhesive wall hook',
    requiredAny: ['adhesive', 'hook', 'wall', 'sticky'],
    requiredAll: ['hook'],
    blockedTerms: ['vacuum cleaner', 'curtain rail', 'ceiling fan'],
    preferredMaxSourcePriceUsd: 6,
  },
};

export const P6_FIRST_PRODUCT_RECOVERY_QUERIES = [
  'adhesive cable clips',
  'silicone cable ties',
  'webcam cover',
  'screen cleaning cloth',
  'adhesive wall hook',
] as const;

export interface MultiRegionCandidateScan {
  query: string;
  optimizedQuery: string;
  marketplace: MarketplaceName;
  country: string;
  candidateSource?: 'affiliate' | 'alternative_product';
  sourceProductId?: string;
  productId: string;
  title: string;
  originalUrl: string;
  sourcePriceUsd: number;
  rejectionReason?: string;
  rejectionReasonCode?: SupplierValidationReasonCode;
  selectedListingPriceUsd?: number;
  validated?: boolean;
}

export interface MultiRegionValidatedProduct {
  productId: number;
  query: string;
  title: string;
  marketplace: MarketplaceName;
  country: string;
  validatedSupplierId: string;
  validatedSkuId?: string;
  validatedShippingCost: number;
  listingPriceUsd: number;
  realCost: number;
  realProfit: number;
  marginRatio: number;
  supplierReliabilityScore: number;
  fallbackSuppliers: number;
}

export interface MultiRegionMarketplaceRunResult {
  marketplace: MarketplaceName;
  context: MarketplaceContext;
  queriesRun: string[];
  scanned: number;
  rejected: number;
  validated: number;
  firstValidatedProduct: MultiRegionValidatedProduct | null;
  scannedProducts: MultiRegionCandidateScan[];
  rejectedProducts: MultiRegionCandidateScan[];
  nearValidProducts: MultiRegionCandidateScan[];
  rejectionSummaryByCode: Record<string, number>;
  blockingIssues: string[];
}

export interface MultiRegionValidationRunResult {
  freeze: FreezeLegacyCatalogResult;
  stopReason: 'first_success' | 'no_valid_product_found';
  marketplacesAttempted: MarketplaceName[];
  marketplaceResults: MultiRegionMarketplaceRunResult[];
  firstValidatedProduct: MultiRegionValidatedProduct | null;
}

export interface SearchFirstValidatedProductParams {
  userId: number;
  marketplace: MarketplaceName;
  queries: string[];
  maxPriceUsd?: number;
  maxSearchResults?: number;
  minSupplierSearch?: number;
  environment?: 'sandbox' | 'production';
  enableAlternativeProductFallback?: boolean;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildAffiliateProductUrl(productId: string): string {
  return `https://www.aliexpress.com/item/${productId}.html`;
}

function toAffiliateCandidateFromAlternative(result: {
  productId: string;
  productTitle: string;
  salePrice: number;
}): AffiliateProduct {
  return {
    productId: result.productId,
    productTitle: result.productTitle,
    productMainImageUrl: '',
    productSmallImageUrls: [],
    salePrice: result.salePrice,
    originalPrice: result.salePrice,
    discount: 0,
    currency: 'USD',
  };
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

function normalizedTerms(input: string): string[] {
  return (input || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !STOPWORDS.has(term));
}

function expandedQueryTerms(query: string, language: string): string[] {
  const baseKey = (query || '').trim().toLowerCase();
  const profile = FIRST_PRODUCT_QUERY_PROFILES[baseKey];
  const aliases = QUERY_LANGUAGE_ALIASES[baseKey] || [profile?.searchQuery || query];
  const languageAwareAliases =
    language === 'es'
      ? aliases
      : aliases.filter((alias) => normalizedTerms(alias).every((term) => /^[a-z0-9]+$/.test(term)));
  return Array.from(new Set(languageAwareAliases.flatMap((item) => normalizedTerms(item))));
}

export function candidateMatchesQuery(query: string, title: string, language: string): boolean {
  const profile = FIRST_PRODUCT_QUERY_PROFILES[(query || '').trim().toLowerCase()];
  const normalizedTitle = (title || '').toLowerCase();
  if (GENERIC_BLOCKED_TERMS.some((term) => normalizedTitle.includes(term))) {
    return false;
  }
  if (profile?.blockedTerms?.some((term) => normalizedTitle.includes(term.toLowerCase()))) {
    return false;
  }
  if (profile?.requiredAll?.some((term) => !normalizedTitle.includes(term.toLowerCase()))) {
    return false;
  }
  if (profile?.requiredAny?.length) {
    const anyHits = profile.requiredAny.filter((term) =>
      normalizedTitle.includes(term.toLowerCase())
    ).length;
    if (anyHits === 0) return false;
  }
  const required = expandedQueryTerms(query, language);
  if (required.length === 0) return true;
  const keywordHits = required.filter((term) => normalizedTitle.includes(term)).length;
  if (profile) {
    const minHits = Math.min(2, required.length);
    if (keywordHits >= minHits) return true;
  } else if (keywordHits >= 1) {
    return true;
  }
  return titleSimilarityRatio(query, title || '') >= 0.45;
}

export function getSearchQueryForFirstProduct(query: string): string {
  const profile = FIRST_PRODUCT_QUERY_PROFILES[(query || '').trim().toLowerCase()];
  return profile?.searchQuery || buildOptimizedSearchQuery(query);
}

function scoreCandidateForFirstProduct(
  query: string,
  candidate: AffiliateProduct,
  language: string
): number {
  const profile = FIRST_PRODUCT_QUERY_PROFILES[(query || '').trim().toLowerCase()];
  const title = String(candidate.productTitle || '');
  const price = Number(candidate.salePrice || 0);
  const volume = Number(candidate.volume || 0);
  const rating = Number(candidate.evaluateRate || candidate.evaluateScore || 0);
  let score = 0;

  if (candidateMatchesQuery(query, title, language)) score += 20;
  if (profile?.preferredMaxSourcePriceUsd != null && price > 0) {
    score += Math.max(0, profile.preferredMaxSourcePriceUsd - price) * 2;
  }
  if (price > 0 && price <= 8) score += 6;
  if (price > 12) score -= 8;
  score += Math.min(volume / 50, 10);
  score += Math.min(rating / 10, 5);
  if (GENERIC_BLOCKED_TERMS.some((term) => title.toLowerCase().includes(term))) score -= 20;

  return score;
}

function inferCategoryFromQuery(query: string): string {
  return (query || 'general')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'general';
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

async function findStrictPreparation(params: {
  userId: number;
  candidate: AffiliateProduct;
  query: string;
  context: MarketplaceContext;
  credentials: Record<string, unknown>;
}): Promise<
  | {
      ok: true;
      preparation: PreventivePublishPreparationResult;
      listingPriceUsd: number;
      attempts: Array<{ multiplier: number; reason: string; reasonCode: SupplierValidationReasonCode }>;
    }
  | {
      ok: false;
      attempts: Array<{ multiplier: number; reason: string; reasonCode: SupplierValidationReasonCode }>;
      dominantReason: string;
      dominantReasonCode: SupplierValidationReasonCode;
    }
> {
  const sourcePrice = Number(params.candidate.salePrice || 0);
  if (!(sourcePrice > 0)) {
    return {
      ok: false,
      attempts: [
        {
          multiplier: 0,
          reason: 'candidate price is missing or invalid',
          reasonCode: 'supplier_data_incomplete',
        },
      ],
      dominantReason: 'candidate price is missing or invalid',
      dominantReasonCode: 'supplier_data_incomplete',
    };
  }

  const attempts: Array<{ multiplier: number; reason: string; reasonCode: SupplierValidationReasonCode }> = [];

  for (const multiplier of STRICT_PRICE_MULTIPLIERS) {
    const listingPriceUsd = roundCurrency(sourcePrice * multiplier);
    try {
      const preparation = await prepareProductForSafePublishing({
        userId: params.userId,
        marketplace: params.context.marketplace,
        credentials: params.credentials,
        listingSalePrice: listingPriceUsd,
        product: {
          id: 0,
          title: params.candidate.productTitle,
          category: inferCategoryFromQuery(params.query),
          aliexpressUrl: buildAffiliateProductUrl(params.candidate.productId),
          aliexpressSku: null,
          aliexpressPrice: sourcePrice,
          importTax: 0,
          currency: params.candidate.currency || 'USD',
          targetCountry: params.context.country,
          shippingCost: null,
          productData: null,
        },
      });
      return {
        ok: true,
        preparation,
        listingPriceUsd,
        attempts,
      };
    } catch (error: any) {
      const reason = error?.message || String(error);
      const reasonCode = classifySupplierValidationReason(reason);
      attempts.push({ multiplier, reason, reasonCode });
      logger.info('[MULTI-REGION-VALIDATION] Candidate rejected at multiplier', {
        marketplace: params.context.marketplace,
        country: params.context.country,
        query: params.query,
        productId: params.candidate.productId,
        multiplier,
        reason,
        reasonCode,
      });
    }
  }

  const summary = new Map<SupplierValidationReasonCode, number>();
  for (const attempt of attempts) {
    summary.set(attempt.reasonCode, (summary.get(attempt.reasonCode) || 0) + 1);
  }
  const dominantReasonCode =
    [...summary.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
  const dominantReason =
    attempts.find((attempt) => attempt.reasonCode === dominantReasonCode)?.reason ||
    attempts[0]?.reason ||
    'candidate failed strict validation';

  return {
    ok: false,
    attempts,
    dominantReason,
    dominantReasonCode,
  };
}

async function createValidatedProduct(params: {
  userId: number;
  query: string;
  candidate: AffiliateProduct;
  context: MarketplaceContext;
  preparation: PreventivePublishPreparationResult;
  listingPriceUsd: number;
}): Promise<MultiRegionValidatedProduct> {
  const supplier = params.preparation.selectedSupplier;
  const images = uniqueImageUrls([
    supplier.productMainImageUrl,
    params.candidate.productMainImageUrl,
    ...(params.candidate.productSmallImageUrls || []),
  ]);
  if (images.length === 0) {
    throw new Error('candidate has no usable image URLs');
  }

  const createData = {
    userId: params.userId,
    aliexpressUrl: supplier.productUrl,
    title: supplier.productTitle || params.candidate.productTitle,
    description: `Validated multi-region candidate for ${params.context.marketplace}/${params.context.country}. Strict preventive validation passed.`,
    aliexpressPrice: supplier.salePriceUsd,
    suggestedPrice: params.listingPriceUsd,
    finalPrice: params.listingPriceUsd,
    currency: 'USD',
    category: inferCategoryFromQuery(params.query),
    images: JSON.stringify(images),
    shippingCost: params.preparation.profitability.shippingUsd,
    importTax: params.preparation.profitability.importTaxUsd,
    totalCost: params.preparation.profitability.totalCostUsd,
    targetCountry: params.context.country,
    originCountry: 'CN',
    status: 'VALIDATED_READY',
    isPublished: false,
    supplierStock: supplier.stock,
    supplierStockCheckedAt: new Date(supplier.validatedAt),
    aliexpressSku: supplier.skuId || null,
    productData: JSON.stringify({
      preventivePublish: params.preparation.metadataPatch.preventivePublish,
      validatedCatalog: {
        rebuiltAt: new Date().toISOString(),
        validatedMarketplace: params.context.marketplace,
        validatedCountry: params.context.country,
        validatedSupplierId: supplier.productId,
        validatedSkuId: supplier.skuId || null,
        validatedShippingCost: params.preparation.profitability.shippingUsd,
        realCost: params.preparation.profitability.totalCostUsd,
        realProfit: params.preparation.profitability.netProfitUsd,
        marginRatio: params.preparation.profitability.marginRatio,
        listingPriceUsd: params.listingPriceUsd,
        supplierReliabilityScore: params.preparation.supplierAudit.supplierReliabilityScore,
        fallbackSuppliers: params.preparation.fallbackSuppliers.map((item) => ({
          supplierId: item.productId,
          skuId: item.skuId || null,
          totalSupplierCostUsd: item.totalSupplierCostUsd,
          rating: item.rating,
          orderCount: item.orderCount,
        })),
      },
      strictDiscovery: {
        query: params.query,
        optimizedQuery: buildOptimizedSearchQuery(params.query),
        originalAffiliateProductId: params.candidate.productId,
        originalAffiliateUrl: buildAffiliateProductUrl(String(params.candidate.productId)),
        marketplace: params.context.marketplace,
        country: params.context.country,
      },
    }),
  };

  const created = await prisma.product.create({ data: createData as any });

  return {
    productId: created.id,
    query: params.query,
    title: createData.title,
    marketplace: params.context.marketplace,
    country: params.context.country,
    validatedSupplierId: supplier.productId,
    validatedSkuId: supplier.skuId || undefined,
    validatedShippingCost: params.preparation.profitability.shippingUsd,
    listingPriceUsd: params.listingPriceUsd,
    realCost: params.preparation.profitability.totalCostUsd,
    realProfit: params.preparation.profitability.netProfitUsd,
    marginRatio: params.preparation.profitability.marginRatio,
    supplierReliabilityScore: params.preparation.supplierAudit.supplierReliabilityScore,
    fallbackSuppliers: params.preparation.fallbackSuppliers.length,
  };
}

export async function searchFirstValidatedProductForMarketplace(
  params: SearchFirstValidatedProductParams
): Promise<MultiRegionMarketplaceRunResult> {
  const maxPriceUsd = params.maxPriceUsd ?? DEFAULT_MAX_PRICE_USD;
  const maxSearchResults = params.maxSearchResults ?? DEFAULT_MAX_SEARCH_RESULTS;
  const minSupplierSearch = params.minSupplierSearch ?? DEFAULT_MIN_SUPPLIER_SEARCH;
  const enableAlternativeProductFallback = params.enableAlternativeProductFallback === true;

  const marketplaceService = new MarketplaceService();
  const marketplaceCreds = await marketplaceService.getCredentials(
    params.userId,
    params.marketplace,
    params.environment || 'production'
  );
  if (!marketplaceCreds?.credentials || !marketplaceCreds.isActive || marketplaceCreds.issues?.length) {
    throw new Error(
      marketplaceCreds?.issues?.join('; ') ||
        `${params.marketplace} credentials not ready for multi-region validation`
    );
  }

  const context = getMarketplaceContext(
    params.marketplace,
    marketplaceCreds.credentials as Record<string, unknown>
  );
  const affiliate = await loadAffiliateService(params.userId);
  const scannedProducts: MultiRegionCandidateScan[] = [];
  const rejectedProducts: MultiRegionCandidateScan[] = [];
  const nearValidProducts: MultiRegionCandidateScan[] = [];
  const rejectionSummaryByCode = new Map<string, number>();
  const blockingIssues: string[] = [];

  for (const query of params.queries) {
    const optimizedQuery = getSearchQueryForFirstProduct(query);
    const profile = FIRST_PRODUCT_QUERY_PROFILES[(query || '').trim().toLowerCase()];
    const searchResult = await affiliate.searchProducts({
      keywords: optimizedQuery.slice(0, 100),
      pageNo: 1,
      pageSize: maxSearchResults,
      shipToCountry: context.country,
      targetCurrency: 'USD',
      targetLanguage: context.language.toUpperCase(),
      maxSalePrice: maxPriceUsd,
      sort: 'LAST_VOLUME_DESC',
    });

    const candidates = [...(searchResult.products || [])].sort(
      (left, right) =>
        scoreCandidateForFirstProduct(query, right, context.language) -
        scoreCandidateForFirstProduct(query, left, context.language)
    );
    if (candidates.length === 0) {
      rejectionSummaryByCode.set(
        'supplier_unavailable',
        (rejectionSummaryByCode.get('supplier_unavailable') || 0) + 1
      );
      rejectedProducts.push({
        query,
        optimizedQuery,
        marketplace: params.marketplace,
        country: context.country,
        productId: '',
        title: '',
        originalUrl: '',
        sourcePriceUsd: 0,
        rejectionReason: `affiliate search returned zero products for query "${query}"`,
        rejectionReasonCode: 'supplier_unavailable',
      });
      continue;
    }

    for (const candidate of candidates) {
      const baseScan: MultiRegionCandidateScan = {
        query,
        optimizedQuery,
        marketplace: params.marketplace,
        country: context.country,
        candidateSource: 'affiliate',
        productId: String(candidate.productId),
        title: candidate.productTitle,
        originalUrl: buildAffiliateProductUrl(String(candidate.productId)),
        sourcePriceUsd: roundCurrency(Number(candidate.salePrice || 0)),
      };
      scannedProducts.push(baseScan);

      const price = Number(candidate.salePrice || 0);
      if (!(price > 0)) {
        rejectionSummaryByCode.set(
          'supplier_data_incomplete',
          (rejectionSummaryByCode.get('supplier_data_incomplete') || 0) + 1
        );
        rejectedProducts.push({
          ...baseScan,
          rejectionReason: 'candidate price is missing or invalid',
          rejectionReasonCode: 'supplier_data_incomplete',
        });
        continue;
      }
      if (price > maxPriceUsd) {
        rejectionSummaryByCode.set(
          'margin_invalid',
          (rejectionSummaryByCode.get('margin_invalid') || 0) + 1
        );
        rejectedProducts.push({
          ...baseScan,
          rejectionReason: `candidate price ${roundCurrency(price)} exceeds maxPriceUsd ${maxPriceUsd}`,
          rejectionReasonCode: 'margin_invalid',
        });
        continue;
      }
      if (
        profile?.preferredMaxSourcePriceUsd != null &&
        price > profile.preferredMaxSourcePriceUsd
      ) {
        rejectionSummaryByCode.set(
          'margin_invalid',
          (rejectionSummaryByCode.get('margin_invalid') || 0) + 1
        );
        rejectedProducts.push({
          ...baseScan,
          rejectionReason: `candidate price ${roundCurrency(price)} exceeds preferred first-product price ${profile.preferredMaxSourcePriceUsd}`,
          rejectionReasonCode: 'margin_invalid',
        });
        continue;
      }
      if (!candidateMatchesQuery(query, candidate.productTitle || '', context.language)) {
        rejectionSummaryByCode.set(
          'supplier_unavailable',
          (rejectionSummaryByCode.get('supplier_unavailable') || 0) + 1
        );
        rejectedProducts.push({
          ...baseScan,
          rejectionReason: `candidate does not match query "${query}" closely enough`,
          rejectionReasonCode: 'supplier_unavailable',
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
          status: 'VALIDATED_READY',
        },
        select: { id: true },
      });
      if (existing) {
        rejectionSummaryByCode.set(
          'unknown',
          (rejectionSummaryByCode.get('unknown') || 0) + 1
        );
        rejectedProducts.push({
          ...baseScan,
          rejectionReason: `already stored as VALIDATED_READY (productId=${existing.id})`,
          rejectionReasonCode: 'unknown',
        });
        continue;
      }

      const prepared = await findStrictPreparation({
        userId: params.userId,
        candidate,
        query,
        context,
        credentials: marketplaceCreds.credentials as Record<string, unknown>,
      });
      if ('dominantReasonCode' in prepared) {
        const failure = prepared;
        rejectionSummaryByCode.set(
          failure.dominantReasonCode,
          (rejectionSummaryByCode.get(failure.dominantReasonCode) || 0) + 1
        );
        const rejectedScan = {
          ...baseScan,
          rejectionReason: failure.dominantReason,
          rejectionReasonCode: failure.dominantReasonCode,
        };
        rejectedProducts.push(rejectedScan);
        if (
          failure.dominantReasonCode === 'margin_invalid' ||
          failure.dominantReasonCode === 'fee_incomplete'
        ) {
          nearValidProducts.push(rejectedScan);
        }

        if (
          enableAlternativeProductFallback &&
          failure.dominantReasonCode === 'no_stock_for_destination'
        ) {
          const alternative = await findAlternativeWithStock({
            userId: params.userId,
            originalProductId: String(candidate.productId),
            originalTitle: candidate.productTitle,
            maxPriceUsd:
              profile?.preferredMaxSourcePriceUsd != null
                ? Math.min(maxPriceUsd, profile.preferredMaxSourcePriceUsd)
                : maxPriceUsd,
            shipToCountry: context.country,
            maxCandidates: 6,
            forceEnabled: true,
          });

          if (alternative && String(alternative.productId) !== String(candidate.productId)) {
            const alternativeCandidate = toAffiliateCandidateFromAlternative(alternative);
            const alternativeScan: MultiRegionCandidateScan = {
              ...baseScan,
              candidateSource: 'alternative_product',
              sourceProductId: String(candidate.productId),
              productId: String(alternative.productId),
              title: alternative.productTitle,
              originalUrl: buildAffiliateProductUrl(String(alternative.productId)),
              sourcePriceUsd: roundCurrency(Number(alternative.salePrice || 0)),
            };
            scannedProducts.push(alternativeScan);

            const preparedAlternative = await findStrictPreparation({
              userId: params.userId,
              candidate: alternativeCandidate,
              query,
              context,
              credentials: marketplaceCreds.credentials as Record<string, unknown>,
            });

            if (!('dominantReasonCode' in preparedAlternative)) {
              if (
                (preparedAlternative.preparation.supplierAudit.searchedAlternatives || 0) <
                minSupplierSearch
              ) {
                rejectionSummaryByCode.set(
                  'supplier_data_incomplete',
                  (rejectionSummaryByCode.get('supplier_data_incomplete') || 0) + 1
                );
                const altRejectedScan = {
                  ...alternativeScan,
                  rejectionReason: `supplier search coverage ${preparedAlternative.preparation.supplierAudit.searchedAlternatives} below minimum ${minSupplierSearch}`,
                  rejectionReasonCode: 'supplier_data_incomplete' as SupplierValidationReasonCode,
                };
                rejectedProducts.push(altRejectedScan);
                nearValidProducts.push(altRejectedScan);
              } else {
                const created = await createValidatedProduct({
                  userId: params.userId,
                  query,
                  candidate: alternativeCandidate,
                  context,
                  preparation: preparedAlternative.preparation,
                  listingPriceUsd: preparedAlternative.listingPriceUsd,
                });

                return {
                  marketplace: params.marketplace,
                  context,
                  queriesRun: params.queries,
                  scanned: scannedProducts.length,
                  rejected: rejectedProducts.length,
                  validated: 1,
                  firstValidatedProduct: created,
                  scannedProducts,
                  rejectedProducts,
                  nearValidProducts,
                  rejectionSummaryByCode: Object.fromEntries(rejectionSummaryByCode),
                  blockingIssues,
                };
              }
            } else {
              const altFailure = preparedAlternative;
              rejectionSummaryByCode.set(
                altFailure.dominantReasonCode,
                (rejectionSummaryByCode.get(altFailure.dominantReasonCode) || 0) + 1
              );
              const altRejectedScan = {
                ...alternativeScan,
                rejectionReason: altFailure.dominantReason,
                rejectionReasonCode: altFailure.dominantReasonCode,
              };
              rejectedProducts.push(altRejectedScan);
              if (
                altFailure.dominantReasonCode === 'margin_invalid' ||
                altFailure.dominantReasonCode === 'fee_incomplete'
              ) {
                nearValidProducts.push(altRejectedScan);
              }
            }
          }
        }
        continue;
      }

      if ((prepared.preparation.supplierAudit.searchedAlternatives || 0) < minSupplierSearch) {
        rejectionSummaryByCode.set(
          'supplier_data_incomplete',
          (rejectionSummaryByCode.get('supplier_data_incomplete') || 0) + 1
        );
        const rejectedScan = {
          ...baseScan,
          rejectionReason: `supplier search coverage ${prepared.preparation.supplierAudit.searchedAlternatives} below minimum ${minSupplierSearch}`,
          rejectionReasonCode: 'supplier_data_incomplete' as SupplierValidationReasonCode,
        };
        rejectedProducts.push(rejectedScan);
        nearValidProducts.push(rejectedScan);
        continue;
      }

      const created = await createValidatedProduct({
        userId: params.userId,
        query,
        candidate,
        context,
        preparation: prepared.preparation,
        listingPriceUsd: prepared.listingPriceUsd,
      });

      return {
        marketplace: params.marketplace,
        context,
        queriesRun: params.queries,
        scanned: scannedProducts.length,
        rejected: rejectedProducts.length,
        validated: 1,
        firstValidatedProduct: created,
        scannedProducts,
        rejectedProducts,
        nearValidProducts,
        rejectionSummaryByCode: Object.fromEntries(rejectionSummaryByCode),
        blockingIssues,
      };
    }
  }

  blockingIssues.push('No candidate reached VALIDATED_READY under strict marketplace-country validation');
  return {
    marketplace: params.marketplace,
    context,
    queriesRun: params.queries,
    scanned: scannedProducts.length,
    rejected: rejectedProducts.length,
    validated: 0,
    firstValidatedProduct: null,
    scannedProducts,
    rejectedProducts,
    nearValidProducts,
    rejectionSummaryByCode: Object.fromEntries(rejectionSummaryByCode),
    blockingIssues,
  };
}

export async function runMultiRegionValidation(params: {
  userId: number;
  marketplaces: MarketplaceName[];
  queries: string[];
  maxPriceUsd?: number;
  maxSearchResults?: number;
  minSupplierSearch?: number;
  environment?: 'sandbox' | 'production';
  enableAlternativeProductFallback?: boolean;
}): Promise<MultiRegionValidationRunResult> {
  const freeze = await freezeLegacyCatalog(params.userId);
  const marketplaceResults: MultiRegionMarketplaceRunResult[] = [];

  for (const marketplace of params.marketplaces) {
    const result = await searchFirstValidatedProductForMarketplace({
      userId: params.userId,
      marketplace,
      queries: params.queries,
      maxPriceUsd: params.maxPriceUsd,
      maxSearchResults: params.maxSearchResults,
      minSupplierSearch: params.minSupplierSearch,
      environment: params.environment,
      enableAlternativeProductFallback: params.enableAlternativeProductFallback,
    });
    marketplaceResults.push(result);
    if (result.firstValidatedProduct) {
      return {
        freeze,
        stopReason: 'first_success',
        marketplacesAttempted: marketplaceResults.map((item) => item.marketplace),
        marketplaceResults,
        firstValidatedProduct: result.firstValidatedProduct,
      };
    }
  }

  return {
    freeze,
    stopReason: 'no_valid_product_found',
    marketplacesAttempted: marketplaceResults.map((item) => item.marketplace),
    marketplaceResults,
    firstValidatedProduct: null,
  };
}

export default {
  searchFirstValidatedProductForMarketplace,
  runMultiRegionValidation,
};
