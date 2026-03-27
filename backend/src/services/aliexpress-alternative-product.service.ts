/**
 * AliExpress Alternative Product Service
 *
 * When placeOrder fails due to SKU_NOT_EXIST or no stock, search for the same product
 * (by title, same or cheaper price) that has stock and return it for purchase.
 * Uses Affiliate API for search and Dropshipping API for stock check.
 */

import { trace } from '../utils/boot-trace';
trace('loading aliexpress-alternative-product.service');

import logger from '../config/logger';

const DEFAULT_MAX_CANDIDATES = 10;
const TITLE_SIMILARITY_MIN_RATIO = 0.3; // less strict: at least 30% overlap to avoid false negatives
const KEYWORDS_MAX_LENGTH = 80; // Affiliate search keywords length

export interface AlternativeProductResult {
  productId: string;
  productUrl: string;
  skuId: string;
  productTitle: string;
  salePrice: number;
}

export interface FindAlternativeParams {
  userId: number;
  originalProductId: string;
  originalTitle: string;
  maxPriceUsd: number;
  shipToCountry: string;
  maxCandidates?: number;
  forceEnabled?: boolean;
}

/**
 * Normalize title for comparison: lowercase, collapse spaces, trim.
 */
function normalizeTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract significant words (length > 1, optional: exclude common stopwords).
 */
function getWords(title: string): string[] {
  const normalized = normalizeTitle(title);
  return normalized
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 1);
}

/**
 * Returns a similarity ratio in [0,1]: share of original words that appear in candidate title.
 */
function titleSimilarityRatio(originalTitle: string, candidateTitle: string): number {
  const wordsA = getWords(originalTitle);
  if (wordsA.length === 0) return 0;
  const wordsB = getWords(candidateTitle);
  const matchCount = wordsA.filter((w) =>
    wordsB.some((b) => b.includes(w) || w.includes(b))
  ).length;
  return matchCount / wordsA.length;
}

function toFixedRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Find an alternative AliExpress product: same (or very similar) product, same or cheaper price, with stock.
 * Returns null if fallback is disabled, no credentials, or no suitable candidate found.
 */
export async function findAlternativeWithStock(
  params: FindAlternativeParams
): Promise<AlternativeProductResult | null> {
  const fallbackEnabled =
    params.forceEnabled === true ||
    process.env.ALIEXPRESS_FALLBACK_ALTERNATIVE_PRODUCT === 'true' ||
    process.env.ALIEXPRESS_FALLBACK_ALTERNATIVE_PRODUCT === '1';
  if (!fallbackEnabled) {
    logger.debug('[ALIEXPRESS-ALTERNATIVE-PRODUCT] Fallback disabled (ALIEXPRESS_FALLBACK_ALTERNATIVE_PRODUCT)');
    return null;
  }

  const {
    userId,
    originalProductId,
    originalTitle,
    maxPriceUsd,
    shipToCountry,
    maxCandidates = DEFAULT_MAX_CANDIDATES,
  } = params;

  const keywords = (originalTitle || '')
    .slice(0, KEYWORDS_MAX_LENGTH)
    .trim();
  if (!keywords) {
    logger.warn('[ALIEXPRESS-ALTERNATIVE-PRODUCT] No keywords from original title');
    return null;
  }

  let affiliateService: any;
  let dropshippingService: any;
  try {
    const { aliexpressAffiliateAPIService } = await import('./aliexpress-affiliate-api.service');
    const { CredentialsManager } = await import('./credentials-manager.service');
    const { AliExpressDropshippingAPIService, refreshAliExpressDropshippingToken } = await import(
      './aliexpress-dropshipping-api.service'
    );

    // Affiliate: app-level or user-level credentials
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
        : await CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', 'production');
    if (!affiliateCreds?.appKey || !affiliateCreds?.appSecret) {
      logger.warn('[ALIEXPRESS-ALTERNATIVE-PRODUCT] Affiliate API not configured');
      return null;
    }
    aliexpressAffiliateAPIService.setCredentials(affiliateCreds);
    affiliateService = aliexpressAffiliateAPIService;

    // Dropshipping: user credentials (required for getProductInfo)
    let dsCreds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production');
    if (!dsCreds?.accessToken) {
      dsCreds = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'sandbox');
    }
    if (!dsCreds?.accessToken) {
      logger.warn('[ALIEXPRESS-ALTERNATIVE-PRODUCT] Dropshipping credentials not found for userId', userId);
      return null;
    }
    const refreshed = await refreshAliExpressDropshippingToken(userId, 'production', { minTtlMs: 60_000 });
    if (refreshed.credentials) dsCreds = refreshed.credentials;
    dropshippingService = new AliExpressDropshippingAPIService();
    dropshippingService.setCredentials(dsCreds);
  } catch (err: any) {
    logger.error('[ALIEXPRESS-ALTERNATIVE-PRODUCT] Failed to load APIs', { error: err?.message });
    return null;
  }

  // Search by keywords
  let searchResult: { products: Array<{ productId: string; productTitle: string; salePrice: number }> };
  try {
    searchResult = await affiliateService.searchProducts({
      keywords,
      pageNo: 1,
      pageSize: 20,
      shipToCountry: shipToCountry || 'US',
      targetCurrency: 'USD',
    });
  } catch (err: any) {
    logger.warn('[ALIEXPRESS-ALTERNATIVE-PRODUCT] Affiliate search failed', { error: err?.message });
    return null;
  }

  const products = searchResult?.products ?? [];
  if (products.length === 0) {
    logger.info('[ALIEXPRESS-ALTERNATIVE-PRODUCT] No search results for keywords', {
      keywords: keywords.slice(0, 40),
    });
    return null;
  }

  // Filter with per-candidate diagnostics (less strict matching, strong logging for discards).
  const candidates: Array<{ productId: string; productTitle: string; salePrice: number }> = [];
  for (const p of products) {
    const pid = String(p.productId).trim();
    const price = Number(p.salePrice);
    const similarity = titleSimilarityRatio(originalTitle, p.productTitle);
    const rejectReasons: string[] = [];

    if (!pid) rejectReasons.push('missing_product_id');
    if (pid === String(originalProductId).trim()) rejectReasons.push('same_product_id');
    if (!Number.isFinite(price)) rejectReasons.push('invalid_price');
    if (Number.isFinite(price) && price > maxPriceUsd) rejectReasons.push('price_above_max');
    if (similarity < TITLE_SIMILARITY_MIN_RATIO) rejectReasons.push('low_title_similarity');

    if (rejectReasons.length > 0) {
      logger.info('[ALIEXPRESS-ALTERNATIVE-PRODUCT] Candidate rejected', {
        candidateProductId: pid || '(empty)',
        price: Number.isFinite(price) ? price : null,
        maxPriceUsd,
        similarity: toFixedRatio(similarity),
        minSimilarity: TITLE_SIMILARITY_MIN_RATIO,
        reasons: rejectReasons,
        titleSample: (p.productTitle || '').slice(0, 120),
      });
      continue;
    }

    candidates.push({
      productId: pid,
      productTitle: p.productTitle,
      salePrice: price,
    });
    if (candidates.length >= maxCandidates) break;
  }

  if (candidates.length === 0) {
    logger.info('[ALIEXPRESS-ALTERNATIVE-PRODUCT] No candidates after filter', {
      originalProductId,
      maxPriceUsd,
      totalSearch: products.length,
      minSimilarity: TITLE_SIMILARITY_MIN_RATIO,
    });
    return null;
  }

  // For each candidate, getProductInfo via Dropshipping and pick first with stock > 0
  for (const candidate of candidates) {
    try {
      const info = await dropshippingService.getProductInfo(candidate.productId, {
        localCountry: shipToCountry || 'US',
        localLanguage: 'en',
      });
      const skus = info?.skus ?? [];
      const withStock = skus.find((s: any) => (s.stock ?? 0) > 0);
      const skuId = withStock?.skuId ?? skus[0]?.skuId;
      if (!skuId) {
        logger.debug('[ALIEXPRESS-ALTERNATIVE-PRODUCT] No SKU for candidate', {
          productId: candidate.productId,
          skuCount: skus.length,
        });
        continue;
      }
      if (!withStock && skus.every((s: any) => (s.stock ?? 0) <= 0)) {
        logger.debug('[ALIEXPRESS-ALTERNATIVE-PRODUCT] No stock for candidate', {
          productId: candidate.productId,
        });
        continue;
      }
      const productUrl = `https://www.aliexpress.com/item/${candidate.productId}.html`;
      logger.info('[ALIEXPRESS-ALTERNATIVE-PRODUCT] Found alternative with stock', {
        originalProductId,
        alternativeProductId: candidate.productId,
        salePrice: info?.salePrice ?? candidate.salePrice,
        skuId,
      });
      return {
        productId: String(candidate.productId),
        productUrl,
        skuId: String(skuId),
        productTitle: info?.productTitle || candidate.productTitle,
        salePrice: Number(info?.salePrice ?? candidate.salePrice ?? 0),
      };
    } catch (err: any) {
      logger.debug('[ALIEXPRESS-ALTERNATIVE-PRODUCT] getProductInfo failed for candidate', {
        productId: candidate.productId,
        error: err?.message,
      });
      continue;
    }
  }

  logger.info('[ALIEXPRESS-ALTERNATIVE-PRODUCT] No alternative with stock found', {
    originalProductId,
    candidatesChecked: candidates.length,
  });
  return null;
}
