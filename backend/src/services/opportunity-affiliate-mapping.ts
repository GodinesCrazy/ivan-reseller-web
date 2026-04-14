/**
 * Maps AliExpress Affiliate API products → opportunity discovery rows.
 * Shared by opportunity-finder and supply-quote (Phase B).
 */

import fxService from './fx.service';
import {
  parseAffiliateDeliveryDaysMax,
  type AffiliateProduct,
} from './aliexpress-affiliate-api.service';

/**
 * Convierte evaluate_score / evaluate_rate de Affiliate a estrellas 0–5
 */
export function affiliateEvaluateToRatingFiveStar(
  evaluateScore?: number | string | null,
  evaluateRate?: number | string | null
): number | undefined {
  const parseNum = (raw: unknown): number | null => {
    if (raw == null) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const s = String(raw).replace(/%/g, '').replace(',', '.').trim();
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };
  const s = parseNum(evaluateScore);
  if (s != null && s > 0) {
    if (s <= 5) return s;
    if (s <= 100) return s / 20;
  }
  const r = parseNum(evaluateRate);
  if (r != null && r > 0) {
    if (r <= 5) return r;
    if (r <= 100) return r / 20;
  }
  return undefined;
}

/** Mantiene supplierScorePct en 0–100 para metadatos / seeds. */
export function affiliateEvaluateToScorePct(
  ratingFive: number | undefined,
  evaluateRate?: number | string | null
): number | undefined {
  const parseNum = (raw: unknown): number | null => {
    if (raw == null) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const s = String(raw).replace(/%/g, '').replace(',', '.').trim();
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };
  const r = parseNum(evaluateRate);
  if (r != null && r > 0) {
    if (r <= 1) return r * 100;
    if (r <= 5) return r * 20;
    if (r <= 100) return r;
  }
  if (ratingFive != null && ratingFive > 0) return Math.min(100, ratingFive * 20);
  return undefined;
}

/** Mapea un producto Affiliate API (query/detail) a fila de discovery; shippingCost solo si la API cotiza (>0), en moneda base. */
export function mapAffiliateProductToDiscoveryRow(p: AffiliateProduct, baseCurrency: string) {
  const sourceCurrency = String(p.currency || 'USD').toUpperCase();
  const sourcePrice = Number(p.salePrice || p.originalPrice) || 0;
  let priceInBase = sourcePrice;
  try {
    priceInBase = fxService.convert(sourcePrice, sourceCurrency, baseCurrency);
  } catch {
    priceInBase = sourcePrice;
  }
  const imgs = [p.productMainImageUrl, ...(p.productSmallImageUrls || [])].filter(
    (x: unknown) => typeof x === 'string' && x.startsWith('http')
  );
  const si = p.shippingInfo;
  const legacy = (p as { shipping_info?: { delivery_days?: unknown; shipping_cost?: unknown } }).shipping_info;
  const deliveryRaw = legacy?.delivery_days;
  const shippingDaysMax =
    si?.deliveryDaysMax != null && Number.isFinite(si.deliveryDaysMax) && si.deliveryDaysMax > 0
      ? si.deliveryDaysMax
      : parseAffiliateDeliveryDaysMax(deliveryRaw);

  let shippingCost: number | undefined;
  const sc = si?.shippingCost != null ? Number(si.shippingCost) : NaN;
  const shipCur = String(si?.shippingCostCurrency || sourceCurrency).toUpperCase();
  if (Number.isFinite(sc) && sc > 0) {
    try {
      shippingCost = fxService.convert(sc, shipCur, baseCurrency);
    } catch {
      shippingCost = sc;
    }
  }

  const evScore = p.evaluateScore;
  const evRate = p.evaluateRate;
  const ratingFiveStar = affiliateEvaluateToRatingFiveStar(evScore, evRate);
  const days =
    shippingDaysMax != null && Number.isFinite(shippingDaysMax) ? shippingDaysMax : undefined;

  return {
    title: p.productTitle,
    price: priceInBase,
    priceMin: priceInBase,
    priceMax: priceInBase,
    priceMinSource: sourcePrice,
    priceMaxSource: sourcePrice,
    priceRangeSourceCurrency: sourceCurrency,
    currency: baseCurrency,
    sourcePrice,
    sourceCurrency,
    productUrl: p.productDetailUrl || p.promotionLink || '',
    imageUrl: imgs[0],
    images: imgs,
    productId: p.productId,
    supplierOrdersCount: p.volume != null ? Number(p.volume) : undefined,
    supplierRating: ratingFiveStar,
    supplierReviewsCount: undefined,
    shippingDaysMax: days,
    estimatedDeliveryDays: days,
    supplierScorePct: affiliateEvaluateToScorePct(ratingFiveStar, evRate),
    shippingCost,
  };
}
