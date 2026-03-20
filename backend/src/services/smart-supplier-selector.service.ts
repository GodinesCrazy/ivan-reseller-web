/**
 * Phase 48 — Smart supplier selector for manual fulfillment
 * Optimized English query → Affiliate search → filters → Dropshipping getProductInfo validation → single best pick.
 */

import logger from '../config/logger';
import type { AffiliateProduct, AffiliateProductDetail } from './aliexpress-affiliate-api.service';

const MAX_QUERY_WORDS = 6;
const SEARCH_PAGE_SIZE = 20;
const TITLE_SIMILARITY_MIN = 0.6;
const MIN_RATING_FIVE = 4.5;
const MIN_ORDER_VOLUME = 10;
const PRICE_BUFFER_RATIO = 1.2;
const MAX_DS_VALIDATE = 12;

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
  'double',
  'layer',
  'organizer',
]);

export interface RecommendedSupplierPayload {
  productId: string;
  productUrl: string;
  affiliateUrl?: string;
  productTitle: string;
  productMainImageUrl: string;
  salePriceUsd: number;
  rating: number;
  orderCount: number;
  shippingSummary: string;
  skuId?: string;
  computedAt: string;
}

export interface FindBestSupplierParams {
  userId: number;
  orderTitle: string;
  originalProductId?: string | null;
  /** Baseline supplier cost in USD (e.g. Product.aliexpressPrice) for +20% cap */
  originalSupplierPriceUsd: number;
  shipToCountry?: string;
}

function normalizeTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(title: string): string[] {
  const normalized = normalizeTitle(title);
  return normalized
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 1);
}

/** Share of original title words found in candidate (same heuristic as alternative-product). */
export function titleSimilarityRatio(originalTitle: string, candidateTitle: string): number {
  const wordsA = getWords(originalTitle);
  if (wordsA.length === 0) return 0;
  const wordsB = getWords(candidateTitle);
  const matchCount = wordsA.filter((w) => wordsB.some((b) => b.includes(w) || w.includes(b))).length;
  return matchCount / wordsA.length;
}

/**
 * Phase 48 Task 1 — clean search query: English-ish tokens, no raw title dump, max 6 words.
 */
export function buildOptimizedSearchQuery(title: string, maxWords = MAX_QUERY_WORDS): string {
  const raw = normalizeTitle(title);
  const tokens = raw
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= maxWords) break;
  }
  if (out.length > 0) return out.join(' ');
  return getWords(title)
    .slice(0, maxWords)
    .join(' ')
    .trim();
}

/** Keywords derived from optimized query: alphabetic tokens length ≥ 3 must appear in candidate title. */
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
  if (!si) return 'Ships to USA (details from AliExpress at checkout)';
  const days = si.estimatedDeliveryDays;
  const methods = si.availableShippingMethods ?? [];
  if (methods.length > 0) {
    const names = methods
      .slice(0, 2)
      .map((m) => (m.estimatedDays ? `${m.methodName || 'Standard'} ~${m.estimatedDays}d` : m.methodName || 'Standard'))
      .join('; ');
    return names || (days ? `Est. ${days} days to US` : 'Shipping options available');
  }
  if (days != null) return `Est. ${days} days to US`;
  return 'USA shipping (confirm on AliExpress)';
}

type Scored = RecommendedSupplierPayload & {
  _sortRating: number;
  _sortDays: number;
  _sortPrice: number;
};

/**
 * Find one validated AliExpress supplier for manual fulfillment.
 */
export async function findBestSupplierForManualOrder(
  params: FindBestSupplierParams
): Promise<RecommendedSupplierPayload | null> {
  const shipTo = (params.shipToCountry || 'US').trim().toUpperCase() || 'US';
  const optimizedQuery = buildOptimizedSearchQuery(params.orderTitle);
  const requiredKw = requiredKeywordsFromQuery(optimizedQuery);
  const maxPriceUsd = Math.max(0.01, params.originalSupplierPriceUsd) * PRICE_BUFFER_RATIO;
  const origPid = params.originalProductId ? String(params.originalProductId).trim() : '';

  logger.info('[SMART-SUPPLIER] Phase 48 start', {
    userId: params.userId,
    optimizedQuery,
    maxPriceUsd: Math.round(maxPriceUsd * 100) / 100,
    shipTo,
  });

  let affiliateService: import('./aliexpress-affiliate-api.service').AliExpressAffiliateAPIService;
  let dropshippingService: import('./aliexpress-dropshipping-api.service').AliExpressDropshippingAPIService;

  try {
    const { aliexpressAffiliateAPIService } = await import('./aliexpress-affiliate-api.service');
    const { CredentialsManager } = await import('./credentials-manager.service');
    const { AliExpressDropshippingAPIService, refreshAliExpressDropshippingToken } = await import(
      './aliexpress-dropshipping-api.service'
    );

    const appKey = (process.env.ALIEXPRESS_AFFILIATE_APP_KEY || process.env.ALIEXPRESS_APP_KEY || '').trim();
    const appSecret = (
      process.env.ALIEXPRESS_AFFILIATE_APP_SECRET ||
      process.env.ALIEXPRESS_APP_SECRET ||
      ''
    ).trim();
    let affiliateCreds =
      appKey && appSecret
        ? ({
            appKey,
            appSecret,
            trackingId: (process.env.ALIEXPRESS_TRACKING_ID || 'ivanreseller').trim(),
            sandbox: false,
          } as any)
        : await CredentialsManager.getCredentials(params.userId, 'aliexpress-affiliate', 'production');
    if (!affiliateCreds?.appKey || !affiliateCreds?.appSecret) {
      logger.warn('[SMART-SUPPLIER] Affiliate not configured');
      return null;
    }
    aliexpressAffiliateAPIService.setCredentials(affiliateCreds);
    affiliateService = aliexpressAffiliateAPIService;

    let dsCreds = await CredentialsManager.getCredentials(params.userId, 'aliexpress-dropshipping', 'production');
    if (!dsCreds?.accessToken) {
      dsCreds = await CredentialsManager.getCredentials(params.userId, 'aliexpress-dropshipping', 'sandbox');
    }
    if (!dsCreds?.accessToken) {
      logger.warn('[SMART-SUPPLIER] Dropshipping credentials missing');
      return null;
    }
    const refreshed = await refreshAliExpressDropshippingToken(params.userId, 'production', { minTtlMs: 60_000 });
    if (refreshed.credentials) dsCreds = refreshed.credentials;
    dropshippingService = new AliExpressDropshippingAPIService();
    dropshippingService.setCredentials(
      dsCreds as unknown as import('../types/api-credentials.types').AliExpressDropshippingCredentials
    );
  } catch (e: any) {
    logger.error('[SMART-SUPPLIER] Init APIs failed', { error: e?.message });
    return null;
  }

  let searchProducts: AffiliateProduct[] = [];
  try {
    const res = await affiliateService.searchProducts({
      keywords: optimizedQuery.slice(0, 100),
      pageNo: 1,
      pageSize: SEARCH_PAGE_SIZE,
      shipToCountry: shipTo,
      targetCurrency: 'USD',
      targetLanguage: 'EN',
    });
    searchProducts = res.products ?? [];
  } catch (e: any) {
    logger.warn('[SMART-SUPPLIER] Affiliate search failed', { error: e?.message });
    return null;
  }

  if (searchProducts.length === 0) {
    logger.info('[SMART-SUPPLIER] No search hits', { optimizedQuery });
    return null;
  }

  // Enrich with productdetail when search omits score/volume
  const needDetailIds = searchProducts
    .filter((p) => p.evaluateScore == null || p.volume == null)
    .map((p) => p.productId)
    .filter(Boolean);
  const detailById = new Map<string, AffiliateProductDetail>();
  if (needDetailIds.length > 0) {
    const unique = [...new Set(needDetailIds)].slice(0, 20);
    for (let i = 0; i < unique.length; i += 10) {
      const batch = unique.slice(i, i + 10);
      try {
        const details = await affiliateService.getProductDetails({
          productIds: batch.join(','),
          shipToCountry: shipTo,
          targetCurrency: 'USD',
          targetLanguage: 'EN',
        });
        for (const d of details) detailById.set(d.productId, d);
      } catch (e: any) {
        logger.debug('[SMART-SUPPLIER] getProductDetails batch failed', { error: e?.message });
      }
    }
  }

  const merged: Array<AffiliateProduct & Partial<AffiliateProductDetail>> = searchProducts.map((p) => {
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

  const prelim = merged.filter((p) => {
    const pid = String(p.productId || '').trim();
    if (!pid) return false;
    if (origPid && pid === origPid) return false;
    const price = Number(p.salePrice);
    if (!Number.isFinite(price) || price <= 0) return false;
    if (price > maxPriceUsd) return false;
    if (titleSimilarityRatio(params.orderTitle, p.productTitle) < TITLE_SIMILARITY_MIN) return false;
    if (!passesKeywordGate(p.productTitle, requiredKw)) return false;
    if (!passesAffiliateQuality(p)) return false;
    if (p.shippingInfo?.shipToCountry && shipTo && p.shippingInfo.shipToCountry.toUpperCase() !== shipTo) {
      return false;
    }
    return true;
  });

  if (prelim.length === 0) {
    logger.info('[SMART-SUPPLIER] No candidates after affiliate filters', {
      searched: merged.length,
    });
    return null;
  }

  prelim.sort((a, b) => {
    const ra = toRatingFiveStar(a.evaluateScore, a.evaluateRate) ?? 0;
    const rb = toRatingFiveStar(b.evaluateScore, b.evaluateRate) ?? 0;
    if (rb !== ra) return rb - ra;
    const va = a.volume ?? 0;
    const vb = b.volume ?? 0;
    if (vb !== va) return vb - va;
    return (a.salePrice ?? 0) - (b.salePrice ?? 0);
  });

  const toValidate = prelim.slice(0, MAX_DS_VALIDATE);
  const validated: Scored[] = [];

  for (const p of toValidate) {
    const pid = String(p.productId);
    try {
      const info = await dropshippingService.getProductInfo(pid, {
        localCountry: shipTo,
        localLanguage: 'en',
      });
      const skus = info?.skus ?? [];
      const withStock = skus.find((s: { stock?: number }) => (s.stock ?? 0) > 0);
      const skuId = withStock?.skuId ?? skus[0]?.skuId;
      if (!skuId) continue;
      if (!withStock && skus.length > 0 && skus.every((s: { stock?: number }) => (s.stock ?? 0) <= 0)) continue;

      const price = Number(info.salePrice || p.salePrice || 0);
      if (!Number.isFinite(price) || price > maxPriceUsd) continue;

      const rating =
        toRatingFiveStar(p.evaluateScore, p.evaluateRate) ?? MIN_RATING_FIVE;
      const orders = p.volume ?? 0;
      const days = info.shippingInfo?.estimatedDeliveryDays ?? 999;
      const img =
        (info.productImages && info.productImages[0]) ||
        p.productMainImageUrl ||
        (p.productSmallImageUrls && p.productSmallImageUrls[0]) ||
        '';

      const productUrl = `https://www.aliexpress.com/item/${pid}.html`;
      const openUrl = (p.promotionLink || p.productDetailUrl || productUrl).trim();

      validated.push({
        productId: pid,
        productUrl,
        affiliateUrl: openUrl !== productUrl ? openUrl : undefined,
        productTitle: info.productTitle || p.productTitle,
        productMainImageUrl: img,
        salePriceUsd: price,
        rating: Math.round(rating * 100) / 100,
        orderCount: orders,
        shippingSummary: shippingSummaryFromDs(info),
        skuId: String(skuId),
        computedAt: new Date().toISOString(),
        _sortRating: -rating,
        _sortDays: days,
        _sortPrice: price,
      });
    } catch (e: any) {
      logger.debug('[SMART-SUPPLIER] getProductInfo rejected candidate', {
        productId: pid,
        error: e?.message,
      });
    }
  }

  if (validated.length === 0) {
    logger.info('[SMART-SUPPLIER] No candidates passed Dropshipping validation');
    return null;
  }

  validated.sort((a, b) => {
    if (a._sortRating !== b._sortRating) return a._sortRating - b._sortRating;
    if (a._sortDays !== b._sortDays) return a._sortDays - b._sortDays;
    return a._sortPrice - b._sortPrice;
  });

  const best = validated[0];
  const { _sortRating, _sortDays, _sortPrice, ...out } = best;
  logger.info('[SMART-SUPPLIER] Phase 48 picked', {
    productId: out.productId,
    price: out.salePriceUsd,
    rating: out.rating,
  });
  return out;
}
