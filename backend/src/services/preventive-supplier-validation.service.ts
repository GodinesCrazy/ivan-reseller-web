/**
 * Phase 7 — Preventive supplier validation.
 * Finds and validates the original AliExpress supplier plus ranked fallback suppliers
 * using real Affiliate search + Dropshipping getProductInfo.
 */

import logger from '../config/logger';
import { env } from '../config/env';
import type { AffiliateProduct, AffiliateProductDetail } from './aliexpress-affiliate-api.service';
import type { AliExpressDropshippingCredentials } from '../types/api-credentials.types';
import { CredentialsManager } from './credentials-manager.service';
import { aliexpressDropshippingAPIService } from './aliexpress-dropshipping-api.service';
import {
  hasValidInternationalTrackingMethod,
  isPreferredEbayUsShippingMethod,
  selectPurchasableSkuSoft,
  minShippingCostFromApi,
  toUsd,
  type CanonicalMlChileFreightTruth,
} from './pre-publish-validator.service';
import { buildOptimizedSearchQuery, titleSimilarityRatio } from './smart-supplier-selector.service';
import {
  classifySupplierValidationReason,
  summarizeSupplierValidationReasons,
  type SupplierValidationReasonCode,
} from './supplier-validation-reason.service';

const SEARCH_PAGE_SIZE = 30;
const TITLE_SIMILARITY_MIN = 0.6;
const MIN_RATING_FIVE_DEFAULT = 4.5;
const MIN_RATING_FIVE_EBAY_US = 4.75; // >95% positive feedback
const MIN_ORDER_VOLUME = 10;
const PRICE_BUFFER_RATIO = 1.3;
const MAX_DS_VALIDATE = 15;
const MIN_ALTERNATIVE_SEARCH = 5;

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
  'usa',
  'us',
  'uk',
  'eu',
]);

export interface PreventiveValidatedSupplier {
  source: 'original' | 'alternative';
  shippingSource?: 'aliexpress_product_shipping' | 'ml_chile_persisted_freight_truth';
  productId: string;
  productUrl: string;
  affiliateUrl?: string;
  productTitle: string;
  productMainImageUrl?: string;
  salePriceUsd: number;
  shippingUsd: number;
  totalSupplierCostUsd: number;
  rating: number;
  orderCount: number;
  shippingSummary: string;
  skuId?: string;
  stock: number;
  shippingMethodsCount: number;
  validatedAt: string;
}

export interface PreventiveRejectedSupplier {
  source: 'original' | 'alternative';
  productId?: string;
  productUrl?: string;
  productTitle?: string;
  reason: string;
  reasonCode: SupplierValidationReasonCode;
}

export interface PreventiveSupplierAuditResult {
  bestSupplier?: PreventiveValidatedSupplier;
  fallbackSuppliers: PreventiveValidatedSupplier[];
  validatedSuppliers: PreventiveValidatedSupplier[];
  rejectedSuppliers: PreventiveRejectedSupplier[];
  originalSupplierPassed: boolean;
  optimizedQuery: string;
  searchedAlternatives: number;
  attemptedAlternativeValidation: number;
  validatedAlternativeCount: number;
  minimumAlternativeSearchTarget: number;
  supplierReliabilityScore: number;
  rejectionSummaryByCode: Record<SupplierValidationReasonCode, number>;
}

export interface PreventiveSupplierAuditParams {
  userId: number;
  orderTitle: string;
  originalProductUrl: string;
  originalSupplierPriceUsd: number;
  shipToCountry: string;
  marketplace?: 'ebay' | 'mercadolibre' | 'amazon';
  preferredSkuId?: string | null;
  persistedMlChileFreightTruth?: CanonicalMlChileFreightTruth;
  seedOriginalRatingFive?: number;
  seedOriginalOrderCount?: number;
  skipAlternativeSearch?: boolean;
}

function normalizeTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(title: string): string[] {
  return normalizeTitle(title)
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function requiredKeywordsFromQuery(optimizedQuery: string): string[] {
  return optimizedQuery
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length >= 3 && /[a-z]/i.test(w));
}

function passesKeywordGate(candidateTitle: string, required: string[]): boolean {
  if (required.length === 0) return true;
  const c = candidateTitle.toLowerCase();
  return required.every((k) => c.includes(k.toLowerCase()));
}

function parseRatingNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const parsed = Number.parseFloat(String(raw).replace(',', '.').replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function toRatingFiveStar(evaluateScore?: unknown, evaluateRate?: unknown): number | null {
  const s = parseRatingNumber(evaluateScore);
  if (s != null && Number.isFinite(s)) {
    if (s <= 5) return s;
    if (s <= 100) return s / 20;
  }
  const r = parseRatingNumber(evaluateRate);
  if (r != null && Number.isFinite(r)) {
    if (r <= 5) return r;
    if (r <= 100) return r / 20;
  }
  return null;
}

function passesAffiliateQuality(
  p: AffiliateProduct & Partial<AffiliateProductDetail>,
  minimumRatingFive: number
): boolean {
  const rating = toRatingFiveStar(p.evaluateScore, p.evaluateRate);
  if (rating == null || rating < minimumRatingFive) return false;
  const vol = p.volume;
  if (vol == null || vol < MIN_ORDER_VOLUME) return false;
  return true;
}

function shippingSummaryFromDs(info: {
  shippingInfo?: {
    availableShippingMethods?: Array<{ methodName?: string; estimatedDays?: number }>;
    estimatedDeliveryDays?: number;
  };
}): string {
  const si = info.shippingInfo;
  if (!si) return 'No API shipping summary available';
  const days = si.estimatedDeliveryDays;
  const methods = si.availableShippingMethods ?? [];
  if (methods.length > 0) {
    return methods
      .slice(0, 2)
      .map((m) => (m.estimatedDays ? `${m.methodName || 'Standard'} ~${m.estimatedDays}d` : m.methodName || 'Standard'))
      .join('; ');
  }
  if (days != null) return `Est. ${days} days`;
  return 'Shipping options available';
}

async function loadDropshippingService(userId: number) {
  const creds = (await CredentialsManager.getCredentials(
    userId,
    'aliexpress-dropshipping',
    'production'
  )) as AliExpressDropshippingCredentials | null;
  if (!creds?.accessToken) {
    throw new Error('AliExpress dropshipping credentials not configured');
  }
  aliexpressDropshippingAPIService.setCredentials(creds);
  return aliexpressDropshippingAPIService;
}

async function loadAffiliateService(userId: number) {
  const { aliexpressAffiliateAPIService } = await import('./aliexpress-affiliate-api.service');
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

async function validateCandidate(params: {
  userId: number;
  productId: string;
  productUrl: string;
  productTitle: string;
  shipToCountry: string;
  marketplace?: 'ebay' | 'mercadolibre' | 'amazon';
  source: 'original' | 'alternative';
  fallbackPriceUsd?: number;
  affiliateUrl?: string;
  rating?: number;
  orderCount?: number;
  imageUrl?: string;
  preferredSkuId?: string | null;
  minimumRatingFive?: number;
  requireRatingEvidence?: boolean;
  enforceEbayUsShippingPolicy?: boolean;
  persistedMlChileFreightTruth?: CanonicalMlChileFreightTruth;
}): Promise<{ ok: true; supplier: PreventiveValidatedSupplier } | { ok: false; rejected: PreventiveRejectedSupplier }> {
  try {
    const minimumRatingFive = Math.max(
      0,
      params.minimumRatingFive ?? MIN_RATING_FIVE_DEFAULT
    );

    const ds = await loadDropshippingService(params.userId);
    const info = await ds.getProductInfo(params.productId, {
      localCountry: params.shipToCountry,
      localLanguage: params.shipToCountry === 'CL' ? 'es' : 'en',
    });

    const seedRating = Number.isFinite(params.rating as number) && Number(params.rating) > 0 ? Number(params.rating) : null;
    const dsRating =
      info.sellerRatingFive != null && Number.isFinite(info.sellerRatingFive) && info.sellerRatingFive > 0
        ? info.sellerRatingFive
        : null;
    const rating = seedRating ?? dsRating;

    if (params.requireRatingEvidence && (rating == null || rating <= 0)) {
      return {
        ok: false,
        rejected: {
          source: params.source,
          productId: params.productId,
          productUrl: params.productUrl,
          productTitle: params.productTitle,
          reason: 'supplier rating evidence missing (requires >95% positive feedback for eBay US)',
          reasonCode: 'supplier_data_incomplete',
        },
      };
    }
    if (rating != null && rating < minimumRatingFive) {
      return {
        ok: false,
        rejected: {
          source: params.source,
          productId: params.productId,
          productUrl: params.productUrl,
          productTitle: params.productTitle,
          reason: `supplier rating ${rating.toFixed(2)} below minimum ${minimumRatingFive.toFixed(2)} (5-star scale)`,
          reasonCode: 'supplier_data_incomplete',
        },
      };
    }

    const skuPick = selectPurchasableSkuSoft(info, params.preferredSkuId);
    if (skuPick.ok === false) {
      return {
        ok: false,
        rejected: {
          source: params.source,
          productId: params.productId,
          productUrl: params.productUrl,
          productTitle: params.productTitle,
          reason: skuPick.reason,
          reasonCode: classifySupplierValidationReason(skuPick.reason),
        },
      };
    }

    const persistedFreightTruth =
      params.source === 'original' &&
      params.shipToCountry === 'CL' &&
      params.persistedMlChileFreightTruth
        ? params.persistedMlChileFreightTruth
        : null;

    const shippingMethods = info.shippingInfo?.availableShippingMethods ?? [];
    const enforceEbayUsShippingPolicy = Boolean(
      params.enforceEbayUsShippingPolicy &&
      params.marketplace === 'ebay' &&
      params.shipToCountry === 'US'
    );
    const approvedTrackableServices = shippingMethods.filter((method) => {
      const methodName = String(method?.methodName || '').trim();
      return (
        isPreferredEbayUsShippingMethod(methodName) &&
        hasValidInternationalTrackingMethod(methodName)
      );
    });

    // Some AliExpress DS responses only expose destination-level delivery_time without method/cost lines.
    // In that case, fallback to buyer freight quote endpoint to recover real service + cost for strict eBay US gating.
    const approvedFreightFallbackOptions: Array<{
      serviceName: string;
      shippingUsd: number;
      estimatedDeliveryTime: number | null;
    }> = [];

    if (enforceEbayUsShippingPolicy && approvedTrackableServices.length === 0) {
      try {
        const freightQuote = await ds.calculateBuyerFreight({
          countryCode: params.shipToCountry,
          productId: params.productId,
          productNum: 1,
          sendGoodsCountryCode: 'CN',
          skuId: skuPick.skuId || undefined,
          price: String(
            Math.max(
              0.01,
              Number.isFinite(skuPick.unitPrice)
                ? skuPick.unitPrice
                : Number(params.fallbackPriceUsd || 0.01)
            )
          ),
          priceCurrency: String(info.currency || 'USD').toUpperCase(),
        });

        for (const option of freightQuote.options || []) {
          const serviceName = String(option.serviceName || '').trim();
          if (
            !serviceName ||
            !isPreferredEbayUsShippingMethod(serviceName) ||
            !hasValidInternationalTrackingMethod(serviceName)
          ) {
            continue;
          }

          const shippingUsd = toUsd(
            Number(option.freightAmount || 0),
            String(option.freightCurrency || 'USD').toUpperCase()
          );
          if (!Number.isFinite(shippingUsd) || shippingUsd < 0) continue;

          approvedFreightFallbackOptions.push({
            serviceName,
            shippingUsd,
            estimatedDeliveryTime:
              option.estimatedDeliveryTime != null &&
              Number.isFinite(Number(option.estimatedDeliveryTime))
                ? Number(option.estimatedDeliveryTime)
                : null,
          });
        }

        approvedFreightFallbackOptions.sort((a, b) => a.shippingUsd - b.shippingUsd);
      } catch (error: any) {
        logger.warn('[PREVENTIVE-SUPPLIER] buyer freight fallback failed for strict eBay US policy', {
          productId: params.productId,
          shipToCountry: params.shipToCountry,
          error: error?.message || String(error),
        });
      }
    }

    if (
      enforceEbayUsShippingPolicy &&
      approvedTrackableServices.length === 0 &&
      approvedFreightFallbackOptions.length === 0 &&
      !env.PRE_PUBLISH_SHIPPING_FALLBACK
    ) {
      return {
        ok: false,
        rejected: {
          source: params.source,
          productId: params.productId,
          productUrl: params.productUrl,
          productTitle: params.productTitle,
          reason:
            'supplier must offer AliExpress Standard Shipping or SpeedPAK with valid international tracking for eBay US',
          reasonCode: 'no_shipping_for_destination',
        },
      };
    }

    const shippingUsdFromProductInfo = minShippingCostFromApi(info, {
      enforceEbayUsApprovedServices: enforceEbayUsShippingPolicy,
      requireInternationalTracking: enforceEbayUsShippingPolicy,
    });
    const shippingUsdFromFreightFallback =
      approvedFreightFallbackOptions.length > 0
        ? approvedFreightFallbackOptions[0]!.shippingUsd
        : null;
    const usingFreightFallback =
      !persistedFreightTruth &&
      enforceEbayUsShippingPolicy &&
      (shippingUsdFromProductInfo == null || !Number.isFinite(shippingUsdFromProductInfo)) &&
      shippingUsdFromFreightFallback != null;
    let shippingUsd =
      persistedFreightTruth?.shippingUsd ??
      shippingUsdFromProductInfo ??
      shippingUsdFromFreightFallback;

    if ((shippingUsd == null || !Number.isFinite(shippingUsd) || shippingUsd < 0) && env.PRE_PUBLISH_SHIPPING_FALLBACK) {
      shippingUsd = env.DEFAULT_SHIPPING_COST_USD;
      logger.info('[PREVENTIVE-SUPPLIER] Using default shipping cost fallback', {
        productId: params.productId,
        shippingUsd,
      });
    }

    if (shippingUsd == null || !Number.isFinite(shippingUsd) || shippingUsd < 0) {
      return {
        ok: false,
        rejected: {
          source: params.source,
          productId: params.productId,
          productUrl: params.productUrl,
          productTitle: params.productTitle,
          reason: 'no real AliExpress API shipping cost for destination',
          reasonCode: 'no_shipping_for_destination',
        },
      };
    }

    const salePriceUsd = toUsd(
      Number.isFinite(skuPick.unitPrice) && skuPick.unitPrice > 0
        ? skuPick.unitPrice
        : Number(params.fallbackPriceUsd || 0),
      (info.currency || 'USD').toString()
    );

    if (!Number.isFinite(salePriceUsd) || salePriceUsd <= 0) {
      return {
        ok: false,
        rejected: {
          source: params.source,
          productId: params.productId,
          productUrl: params.productUrl,
          productTitle: params.productTitle,
          reason: 'invalid supplier price from Dropshipping API',
          reasonCode: 'supplier_data_incomplete',
        },
      };
    }

    const stock = info.skus?.reduce((sum, sku) => sum + Math.max(0, sku.stock ?? 0), 0) ?? Math.max(0, info.stock ?? 0);
    const shippingMethodsCount = persistedFreightTruth
      ? 1
      : usingFreightFallback
        ? approvedFreightFallbackOptions.length
        : info.shippingInfo?.availableShippingMethods?.length ?? 0;
    const shippingSummary = persistedFreightTruth
      ? `${persistedFreightTruth.selectedServiceName} (persisted ML Chile freight truth)`
      : usingFreightFallback
        ? (() => {
            const selected = approvedFreightFallbackOptions[0];
            if (!selected) return 'Buyer freight fallback (strict eBay US)';
            return selected.estimatedDeliveryTime != null
              ? `${selected.serviceName} ~${selected.estimatedDeliveryTime}d (buyer freight fallback)`
              : `${selected.serviceName} (buyer freight fallback)`;
          })()
      : shippingSummaryFromDs(info);

    if (persistedFreightTruth) {
      logger.info('[PREVENTIVE-SUPPLIER] Using persisted ML Chile freight truth for original supplier validation', {
        productId: params.productId,
        shipToCountry: params.shipToCountry,
        shippingUsd: persistedFreightTruth.shippingUsd,
        selectedServiceName: persistedFreightTruth.selectedServiceName,
        checkedAt: persistedFreightTruth.checkedAt,
        ageHours: persistedFreightTruth.ageHours,
      });
    }

    const supplier: PreventiveValidatedSupplier = {
      source: params.source,
      shippingSource: persistedFreightTruth
        ? 'ml_chile_persisted_freight_truth'
        : 'aliexpress_product_shipping',
      productId: params.productId,
      productUrl: params.productUrl,
      affiliateUrl: params.affiliateUrl,
      productTitle: info.productTitle || params.productTitle,
      productMainImageUrl: info.productImages?.[0] || params.imageUrl,
      salePriceUsd,
      shippingUsd,
      totalSupplierCostUsd: salePriceUsd + shippingUsd,
      rating: rating ?? 0,
      orderCount: params.orderCount ?? 0,
      shippingSummary,
      skuId: skuPick.skuId || undefined,
      stock,
      shippingMethodsCount,
      validatedAt: new Date().toISOString(),
    };
    return { ok: true, supplier };
  } catch (error: any) {
    return {
      ok: false,
        rejected: {
          source: params.source,
          productId: params.productId,
          productUrl: params.productUrl,
          productTitle: params.productTitle,
          reason: error?.message || 'supplier validation failed',
          reasonCode: classifySupplierValidationReason(error?.message || 'supplier validation failed'),
        },
      };
  }
}

function computeReliabilityScore(validated: PreventiveValidatedSupplier[]): number {
  if (validated.length === 0) return 0;
  const capped = validated.slice(0, 5);
  const avgRating = capped.reduce((sum, s) => sum + Math.min(5, Math.max(0, s.rating || 0)), 0) / capped.length;
  const avgOrders = capped.reduce((sum, s) => sum + Math.min(500, Math.max(0, s.orderCount || 0)), 0) / capped.length;
  const coverageScore = Math.min(1, capped.length / 5);
  const orderScore = Math.min(1, avgOrders / 100);
  const ratingScore = avgRating / 5;
  return Math.round((coverageScore * 0.35 + ratingScore * 0.4 + orderScore * 0.25) * 100);
}

export async function runPreventiveSupplierAudit(
  params: PreventiveSupplierAuditParams
): Promise<PreventiveSupplierAuditResult> {
  const shipTo = (params.shipToCountry || 'US').trim().toUpperCase() || 'US';
  const marketplace = params.marketplace || 'mercadolibre';
  const strictEbayUsPolicy = marketplace === 'ebay' && shipTo === 'US';
  const minimumRatingFive = strictEbayUsPolicy
    ? MIN_RATING_FIVE_EBAY_US
    : MIN_RATING_FIVE_DEFAULT;
  const originalProductUrl = (params.originalProductUrl || '').trim();
  const originalProductIdMatch = originalProductUrl.match(/\/item\/(\d+)(?:\.[a-z]+)?(?:\?|$|\/)/i);
  const originalProductId = originalProductIdMatch?.[1]?.trim() || '';
  const optimizedQuery = buildOptimizedSearchQuery(params.orderTitle);
  const requiredKw = requiredKeywordsFromQuery(optimizedQuery);
  const maxPriceUsd = Math.max(0.01, params.originalSupplierPriceUsd || 0.01) * PRICE_BUFFER_RATIO;

  const validatedSuppliers: PreventiveValidatedSupplier[] = [];
  const rejectedSuppliers: PreventiveRejectedSupplier[] = [];

  if (originalProductId) {
    let originalRating: number | undefined =
      Number.isFinite(params.seedOriginalRatingFive as number) && Number(params.seedOriginalRatingFive) > 0
        ? Number(params.seedOriginalRatingFive)
        : undefined;
    let originalOrderCount: number | undefined =
      Number.isFinite(params.seedOriginalOrderCount as number) && Number(params.seedOriginalOrderCount) >= 0
        ? Number(params.seedOriginalOrderCount)
        : undefined;
    try {
      const affiliate = await loadAffiliateService(params.userId);
      const detail = await affiliate.getProductDetails({
        productIds: originalProductId,
        shipToCountry: shipTo,
        targetCurrency: 'USD',
        targetLanguage: shipTo === 'CL' ? 'ES' : 'EN',
      });
      const first = detail?.[0];
      const affiliateRating =
        first != null
          ? toRatingFiveStar(first.evaluateScore, first.evaluateRate) ?? undefined
          : undefined;
      const affiliateOrderCount =
        first?.volume != null && Number.isFinite(Number(first.volume))
          ? Number(first.volume)
          : undefined;

      if (affiliateRating != null && affiliateRating > 0) {
        originalRating = affiliateRating;
      }
      if (affiliateOrderCount != null && affiliateOrderCount >= 0) {
        originalOrderCount = affiliateOrderCount;
      }
    } catch (error: any) {
      logger.warn('[PREVENTIVE-SUPPLIER] Could not fetch affiliate detail for original supplier', {
        productId: originalProductId,
        shipTo,
        marketplace,
        error: error?.message || String(error),
      });
    }

    const originalValidation = await validateCandidate({
      userId: params.userId,
      productId: originalProductId,
      productUrl: originalProductUrl,
      productTitle: params.orderTitle,
      shipToCountry: shipTo,
      marketplace,
      source: 'original',
      fallbackPriceUsd: params.originalSupplierPriceUsd,
      rating: originalRating,
      orderCount: originalOrderCount,
      minimumRatingFive,
      requireRatingEvidence: strictEbayUsPolicy,
      enforceEbayUsShippingPolicy: strictEbayUsPolicy,
      preferredSkuId: params.preferredSkuId,
      persistedMlChileFreightTruth: params.persistedMlChileFreightTruth,
    });
    if (originalValidation.ok === true) {
      validatedSuppliers.push(originalValidation.supplier);
    } else {
      rejectedSuppliers.push(originalValidation.rejected);
    }
  } else {
    rejectedSuppliers.push({
      source: 'original',
      productUrl: originalProductUrl,
      productTitle: params.orderTitle,
      reason: 'could not parse original AliExpress product id from URL',
      reasonCode: 'no_supplier_sku',
    });
  }

  if (params.skipAlternativeSearch) {
    return {
      bestSupplier: validatedSuppliers[0],
      fallbackSuppliers: validatedSuppliers.slice(1),
      validatedSuppliers,
      rejectedSuppliers,
      originalSupplierPassed: validatedSuppliers.some((s) => s.source === 'original'),
      optimizedQuery,
      searchedAlternatives: 0,
      attemptedAlternativeValidation: 0,
      validatedAlternativeCount: 0,
      minimumAlternativeSearchTarget: 0,
      supplierReliabilityScore: computeReliabilityScore(validatedSuppliers),
      rejectionSummaryByCode: summarizeSupplierValidationReasons(
        rejectedSuppliers.map((item) => item.reasonCode || item.reason)
      ),
    };
  }

  let searchedAlternatives = 0;
  let attemptedAlternativeValidation = 0;

  try {
    const affiliate = await loadAffiliateService(params.userId);
    const searchResult = await affiliate.searchProducts({
      keywords: optimizedQuery.slice(0, 100),
      pageNo: 1,
      pageSize: SEARCH_PAGE_SIZE,
      shipToCountry: shipTo,
      targetCurrency: 'USD',
      targetLanguage: shipTo === 'CL' ? 'ES' : 'EN',
    });
    const searchProducts = searchResult.products ?? [];
    searchedAlternatives = searchProducts.length;

    const needDetails = searchProducts
      .filter((p) => p.evaluateScore == null || p.volume == null)
      .map((p) => p.productId)
      .filter(Boolean);
    const detailById = new Map<string, AffiliateProductDetail>();
    if (needDetails.length > 0) {
      const unique = [...new Set(needDetails)].slice(0, 20);
      for (let i = 0; i < unique.length; i += 10) {
        const batch = unique.slice(i, i + 10);
        try {
          const details = await affiliate.getProductDetails({
            productIds: batch.join(','),
            shipToCountry: shipTo,
            targetCurrency: 'USD',
            targetLanguage: shipTo === 'CL' ? 'ES' : 'EN',
          });
          for (const detail of details) detailById.set(detail.productId, detail);
        } catch (error: any) {
          logger.debug('[PREVENTIVE-SUPPLIER] getProductDetails batch failed', {
            error: error?.message,
          });
        }
      }
    }

    const merged = searchProducts.map((p) => {
      const d = detailById.get(p.productId);
      return {
        ...p,
        ...(d
          ? {
              evaluateScore: d.evaluateScore ?? p.evaluateScore,
              evaluateRate: d.evaluateRate ?? p.evaluateRate,
              volume: d.volume ?? p.volume,
              shippingInfo: d.shippingInfo,
            }
          : {}),
      };
    });

    const preliminary = merged.filter((p) => {
      const pid = String(p.productId || '').trim();
      if (!pid || pid === originalProductId) return false;
      const price = Number(p.salePrice);
      if (!Number.isFinite(price) || price <= 0 || price > maxPriceUsd) return false;
      if (titleSimilarityRatio(params.orderTitle, p.productTitle) < TITLE_SIMILARITY_MIN) return false;
      if (!passesKeywordGate(p.productTitle, requiredKw)) return false;
      if (!passesAffiliateQuality(p, minimumRatingFive)) return false;
      if (p.shippingInfo?.shipToCountry && p.shippingInfo.shipToCountry.toUpperCase() !== shipTo) return false;
      return true;
    });

    preliminary.sort((a, b) => {
      const ra = toRatingFiveStar(a.evaluateScore, a.evaluateRate) ?? 0;
      const rb = toRatingFiveStar(b.evaluateScore, b.evaluateRate) ?? 0;
      if (rb !== ra) return rb - ra;
      const va = a.volume ?? 0;
      const vb = b.volume ?? 0;
      if (vb !== va) return vb - va;
      return (a.salePrice ?? 0) - (b.salePrice ?? 0);
    });

    for (const candidate of preliminary.slice(0, MAX_DS_VALIDATE)) {
      attemptedAlternativeValidation++;
      const validation = await validateCandidate({
        userId: params.userId,
        productId: String(candidate.productId),
        productUrl: `https://www.aliexpress.com/item/${candidate.productId}.html`,
        productTitle: candidate.productTitle,
        shipToCountry: shipTo,
        marketplace,
        source: 'alternative',
        fallbackPriceUsd: candidate.salePrice,
        affiliateUrl: (candidate.promotionLink || candidate.productDetailUrl || '').trim() || undefined,
        rating: toRatingFiveStar(candidate.evaluateScore, candidate.evaluateRate) ?? 0,
        orderCount: candidate.volume ?? 0,
        minimumRatingFive,
        requireRatingEvidence: strictEbayUsPolicy,
        enforceEbayUsShippingPolicy: strictEbayUsPolicy,
        imageUrl: candidate.productMainImageUrl,
      });
      if (validation.ok === true) {
        validatedSuppliers.push(validation.supplier);
      } else {
        rejectedSuppliers.push(validation.rejected);
      }
    }
  } catch (error: any) {
    rejectedSuppliers.push({
      source: 'alternative',
      productTitle: params.orderTitle,
      reason: `alternative supplier search failed: ${error?.message || 'unknown error'}`,
      reasonCode: classifySupplierValidationReason(
        `alternative supplier search failed: ${error?.message || 'unknown error'}`
      ),
    });
  }

  validatedSuppliers.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
    return a.totalSupplierCostUsd - b.totalSupplierCostUsd;
  });

  const bestSupplier = validatedSuppliers[0];
  const fallbackSuppliers = validatedSuppliers.slice(1);

  return {
    bestSupplier,
    fallbackSuppliers,
    validatedSuppliers,
    rejectedSuppliers,
    originalSupplierPassed: validatedSuppliers.some((s) => s.source === 'original'),
    optimizedQuery,
    searchedAlternatives,
    attemptedAlternativeValidation,
    validatedAlternativeCount: validatedSuppliers.filter((s) => s.source === 'alternative').length,
    minimumAlternativeSearchTarget: MIN_ALTERNATIVE_SEARCH,
    supplierReliabilityScore: computeReliabilityScore(validatedSuppliers),
    rejectionSummaryByCode: summarizeSupplierValidationReasons(
      rejectedSuppliers.map((item) => item.reasonCode || item.reason)
    ),
  };
}
