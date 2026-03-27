/**
 * Phase 7 — Preventive supplier validation.
 * Finds and validates the original AliExpress supplier plus ranked fallback suppliers
 * using real Affiliate search + Dropshipping getProductInfo.
 */

import logger from '../config/logger';
import type { AffiliateProduct, AffiliateProductDetail } from './aliexpress-affiliate-api.service';
import type { AliExpressDropshippingCredentials } from '../types/api-credentials.types';
import { CredentialsManager } from './credentials-manager.service';
import { aliexpressDropshippingAPIService } from './aliexpress-dropshipping-api.service';
import {
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
const MIN_RATING_FIVE = 4.5;
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
  preferredSkuId?: string | null;
  persistedMlChileFreightTruth?: CanonicalMlChileFreightTruth;
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

function toRatingFiveStar(evaluateScore?: number, evaluateRate?: number): number | null {
  const s = evaluateScore;
  if (s != null && Number.isFinite(s)) {
    if (s <= 5) return s;
    if (s <= 100) return s / 20;
  }
  const r = evaluateRate;
  if (r != null && Number.isFinite(r)) {
    if (r <= 5) return r;
    if (r <= 100) return r / 20;
  }
  return null;
}

function passesAffiliateQuality(p: AffiliateProduct & Partial<AffiliateProductDetail>): boolean {
  const rating = toRatingFiveStar(p.evaluateScore, p.evaluateRate);
  if (rating == null || rating < MIN_RATING_FIVE) return false;
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
  source: 'original' | 'alternative';
  fallbackPriceUsd?: number;
  affiliateUrl?: string;
  rating?: number;
  orderCount?: number;
  imageUrl?: string;
  preferredSkuId?: string | null;
  persistedMlChileFreightTruth?: CanonicalMlChileFreightTruth;
}): Promise<{ ok: true; supplier: PreventiveValidatedSupplier } | { ok: false; rejected: PreventiveRejectedSupplier }> {
  try {
    const ds = await loadDropshippingService(params.userId);
    const info = await ds.getProductInfo(params.productId, {
      localCountry: params.shipToCountry,
      localLanguage: params.shipToCountry === 'CL' ? 'es' : 'en',
    });

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

    const shippingUsd = persistedFreightTruth?.shippingUsd ?? minShippingCostFromApi(info);
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
    const shippingMethodsCount = persistedFreightTruth ? 1 : info.shippingInfo?.availableShippingMethods?.length ?? 0;
    const shippingSummary = persistedFreightTruth
      ? `${persistedFreightTruth.selectedServiceName} (persisted ML Chile freight truth)`
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
      rating: params.rating ?? 0,
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
  const originalProductUrl = (params.originalProductUrl || '').trim();
  const originalProductIdMatch = originalProductUrl.match(/\/item\/(\d+)(?:\.[a-z]+)?(?:\?|$|\/)/i);
  const originalProductId = originalProductIdMatch?.[1]?.trim() || '';
  const optimizedQuery = buildOptimizedSearchQuery(params.orderTitle);
  const requiredKw = requiredKeywordsFromQuery(optimizedQuery);
  const maxPriceUsd = Math.max(0.01, params.originalSupplierPriceUsd || 0.01) * PRICE_BUFFER_RATIO;

  const validatedSuppliers: PreventiveValidatedSupplier[] = [];
  const rejectedSuppliers: PreventiveRejectedSupplier[] = [];

  if (originalProductId) {
    const originalValidation = await validateCandidate({
      userId: params.userId,
      productId: originalProductId,
      productUrl: originalProductUrl,
      productTitle: params.orderTitle,
      shipToCountry: shipTo,
      source: 'original',
      fallbackPriceUsd: params.originalSupplierPriceUsd,
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
      if (!passesAffiliateQuality(p)) return false;
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
        source: 'alternative',
        fallbackPriceUsd: candidate.salePrice,
        affiliateUrl: (candidate.promotionLink || candidate.productDetailUrl || '').trim() || undefined,
        rating: toRatingFiveStar(candidate.evaluateScore, candidate.evaluateRate) ?? 0,
        orderCount: candidate.volume ?? 0,
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
