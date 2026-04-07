/**
 * Order-Time Freight Truth
 *
 * Resolves the real AliExpress supplier freight cost at the moment an order
 * is received. This is the Capa 1 (Supplier Freight Truth) of the hybrid
 * dropshipping shipping architecture.
 *
 * Granularity: AliExpress DS API supports country-level freight quotes (CL)
 * but NOT city/commune/postal-code level. A buyer in Talca gets the same
 * freight quote as a buyer in Santiago — the API does not differentiate.
 *
 * Status flags:
 *  - SHIPPING_TRUTH_OK        → fresh real quote (≤ 7 days) confirmed at order time
 *  - SHIPPING_TRUTH_ESTIMATED → stale or failed re-quote; using last-known value
 *  - SHIPPING_TRUTH_MISSING   → no freight truth ever recorded; using conservative band
 */

import logger from '../config/logger';
import { prisma } from '../config/database';

/** 7-day staleness threshold for order-time freight re-use */
const ORDER_TIME_FREIGHT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Conservative fallback when no freight truth exists (AliExpress Standard CN→CL) */
const CONSERVATIVE_FREIGHT_USD_CL = 5.99;
const CONSERVATIVE_ETA_DAYS_MIN = 20;
const CONSERVATIVE_ETA_DAYS_MAX = 45;

export type ShippingTruthStatus =
  | 'SHIPPING_TRUTH_OK'
  | 'SHIPPING_TRUTH_ESTIMATED'
  | 'SHIPPING_TRUTH_MISSING';

export interface OrderTimeFreightResult {
  freightUsd: number;
  serviceName: string;
  etaDaysMin: number;
  etaDaysMax: number;
  shippingTruthStatus: ShippingTruthStatus;
  /** Absolute date by which freight truth was confirmed (for audit log) */
  confirmedAt: string;
  /** Human-readable explanation of how this freight was resolved */
  resolution: string;
}

function parseMeta(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return {};
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
  } catch { return {}; }
}

/**
 * Resolve freight truth for an order at purchase time.
 *
 * Priority:
 *  1. If productData.mlChileFreight is fresh (≤ 7d) → SHIPPING_TRUTH_OK
 *  2. If stale → attempt live re-quote from AliExpress DS API → update DB → SHIPPING_TRUTH_OK
 *  3. If re-quote fails → use stored stale value → SHIPPING_TRUTH_ESTIMATED
 *  4. If no freight truth ever persisted → use conservative band → SHIPPING_TRUTH_MISSING
 */
export async function resolveOrderTimeFreightTruth(
  productId: number,
  targetCountry: string = 'CL',
): Promise<OrderTimeFreightResult> {
  const now = Date.now();
  const nowIso = new Date().toISOString();

  // Read product from DB
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      userId: true,
      aliexpressSku: true,
      aliexpressUrl: true,
      aliexpressPrice: true,
      shippingCost: true,
      productData: true,
    },
  });

  if (!product) {
    logger.warn('[ORDER-TIME-FREIGHT] Product not found, using conservative band', { productId });
    return {
      freightUsd: CONSERVATIVE_FREIGHT_USD_CL,
      serviceName: 'AliExpress Standard Shipping (conservative estimate)',
      etaDaysMin: CONSERVATIVE_ETA_DAYS_MIN,
      etaDaysMax: CONSERVATIVE_ETA_DAYS_MAX,
      shippingTruthStatus: 'SHIPPING_TRUTH_MISSING',
      confirmedAt: nowIso,
      resolution: 'Product not found in DB; conservative band applied',
    };
  }

  const meta = parseMeta(product.productData);
  const persisted = meta.mlChileFreight as Record<string, unknown> | undefined;

  // ── 1. Fresh persisted freight truth ────────────────────────────────────────
  if (
    persisted &&
    persisted.freightSummaryCode === 'freight_quote_found_for_cl' &&
    typeof persisted.selectedFreightAmount === 'number' &&
    Number.isFinite(persisted.selectedFreightAmount) &&
    persisted.selectedFreightAmount >= 0
  ) {
    const checkedAt = String(persisted.checkedAt || persisted.observedAt || persisted.auditedAt || '');
    const ageMs = checkedAt ? now - new Date(checkedAt).getTime() : Infinity;

    if (ageMs <= ORDER_TIME_FREIGHT_MAX_AGE_MS) {
      const freightUsd = persisted.selectedFreightAmount as number;
      logger.info('[ORDER-TIME-FREIGHT] Using fresh persisted freight truth', {
        productId,
        freightUsd,
        ageHours: Math.round(ageMs / 3600000),
        serviceName: persisted.selectedServiceName,
      });
      return {
        freightUsd,
        serviceName: String(persisted.selectedServiceName || 'AliExpress Standard Shipping'),
        etaDaysMin: CONSERVATIVE_ETA_DAYS_MIN,
        etaDaysMax: CONSERVATIVE_ETA_DAYS_MAX,
        shippingTruthStatus: 'SHIPPING_TRUTH_OK',
        confirmedAt: checkedAt || nowIso,
        resolution: `Fresh mlChileFreight from productData (age: ${Math.round(ageMs / 3600000)}h)`,
      };
    }

    // ── 2. Stale — attempt live re-quote ──────────────────────────────────────
    logger.info('[ORDER-TIME-FREIGHT] mlChileFreight is stale — attempting live re-quote', {
      productId,
      ageHours: Math.round(ageMs / 3600000),
    });

    try {
      const reQuoted = await attemptLiveFreightReQuote(product, targetCountry);
      if (reQuoted) {
        logger.info('[ORDER-TIME-FREIGHT] Live re-quote succeeded', {
          productId,
          freightUsd: reQuoted.freightUsd,
          serviceName: reQuoted.serviceName,
        });
        return { ...reQuoted, shippingTruthStatus: 'SHIPPING_TRUTH_OK', confirmedAt: nowIso };
      }
    } catch (err: any) {
      logger.warn('[ORDER-TIME-FREIGHT] Live re-quote failed, falling back to stale persisted value', {
        productId,
        error: err?.message,
      });
    }

    // ── 3. Re-quote failed — use stale value with ESTIMATED status ────────────
    const staleFreight = persisted.selectedFreightAmount as number;
    logger.warn('[ORDER-TIME-FREIGHT] Using stale freight truth (SHIPPING_TRUTH_ESTIMATED)', {
      productId,
      freightUsd: staleFreight,
      ageHours: Math.round(ageMs / 3600000),
    });
    return {
      freightUsd: staleFreight,
      serviceName: String(persisted.selectedServiceName || 'AliExpress Standard Shipping'),
      etaDaysMin: CONSERVATIVE_ETA_DAYS_MIN,
      etaDaysMax: CONSERVATIVE_ETA_DAYS_MAX,
      shippingTruthStatus: 'SHIPPING_TRUTH_ESTIMATED',
      confirmedAt: checkedAt || nowIso,
      resolution: `Stale mlChileFreight (age: ${Math.round(ageMs / 3600000)}h); re-quote failed`,
    };
  }

  // ── 4. No freight truth persisted — use product.shippingCost or conservative band ──
  const fallbackFreight =
    product.shippingCost !== null && Number.isFinite(Number(product.shippingCost)) && Number(product.shippingCost) > 0
      ? Number(product.shippingCost)
      : CONSERVATIVE_FREIGHT_USD_CL;

  logger.warn('[ORDER-TIME-FREIGHT] No mlChileFreight in productData (SHIPPING_TRUTH_MISSING)', {
    productId,
    fallbackFreight,
    fromShippingCostColumn: product.shippingCost !== null,
  });

  return {
    freightUsd: fallbackFreight,
    serviceName: 'AliExpress Standard Shipping (estimated)',
    etaDaysMin: CONSERVATIVE_ETA_DAYS_MIN,
    etaDaysMax: CONSERVATIVE_ETA_DAYS_MAX,
    shippingTruthStatus: 'SHIPPING_TRUTH_MISSING',
    confirmedAt: nowIso,
    resolution: `No mlChileFreight persisted; using shippingCost column (${fallbackFreight} USD)`,
  };
}

/**
 * Attempt a live AliExpress freight re-quote for an order.
 * Returns null if the product lacks the required fields (productId from URL, skuId).
 */
async function attemptLiveFreightReQuote(
  product: {
    id: number;
    userId: number;
    aliexpressSku: string | null;
    aliexpressUrl: string | null;
    productData: unknown;
  },
  targetCountry: string,
): Promise<{ freightUsd: number; serviceName: string; etaDaysMin: number; etaDaysMax: number; resolution: string } | null> {
  // Extract AliExpress productId from the stored URL — this is the canonical source
  const { aliExpressSupplierAdapter } = await import('../services/adapters/aliexpress-supplier.adapter');
  const aliexpressProductId = product.aliexpressUrl
    ? (aliExpressSupplierAdapter.getProductIdFromUrl(product.aliexpressUrl) ?? '')
    : '';

  if (!aliexpressProductId) {
    logger.warn('[ORDER-TIME-FREIGHT] Cannot re-quote: no AliExpress product ID extractable from aliexpressUrl', {
      productId: product.id,
      hasUrl: Boolean(product.aliexpressUrl),
    });
    return null;
  }

  const skuId = product.aliexpressSku || undefined;

  // Lazy import to avoid circular deps / boot cost on non-dropshipping paths
  const { aliexpressDropshippingAPIService } = await import(
    '../services/aliexpress-dropshipping-api.service'
  );
  const { selectMlChileFreightOption } = await import('./ml-chile-freight-selector');

  const quoteResult = await aliexpressDropshippingAPIService.calculateBuyerFreight({
    countryCode: targetCountry,
    productId: aliexpressProductId,
    productNum: 1,
    sendGoodsCountryCode: 'CN',
    skuId,
  });

  const selection = selectMlChileFreightOption(quoteResult.options);
  if (!selection.selected) {
    logger.warn('[ORDER-TIME-FREIGHT] Re-quote returned no usable options', {
      productId: product.id,
      reason: selection.reason,
    });
    return null;
  }

  const freightUsd = selection.selected.freightAmount;
  const serviceName = selection.selected.serviceName;
  const etaDays = selection.selected.estimatedDeliveryTime ?? CONSERVATIVE_ETA_DAYS_MAX;
  const etaDaysMin = Math.max(CONSERVATIVE_ETA_DAYS_MIN, Math.round(etaDays * 0.7));
  const etaDaysMax = Math.max(CONSERVATIVE_ETA_DAYS_MAX, etaDays);

  // Persist the fresh quote back to productData
  const updatedFreight = {
    freightSummaryCode: 'freight_quote_found_for_cl',
    targetCountry,
    selectedServiceName: serviceName,
    selectedFreightAmount: freightUsd,
    selectedFreightCurrency: 'USD',
    checkedAt: new Date().toISOString(),
    selectionReason: 'order_time_recheck',
  };

  await persistUpdatedFreight(product.id, updatedFreight, freightUsd);

  return {
    freightUsd,
    serviceName,
    etaDaysMin,
    etaDaysMax,
    resolution: `Live re-quote at order time: ${serviceName} = $${freightUsd} USD`,
  };
}

async function persistUpdatedFreight(
  productId: number,
  freightRecord: Record<string, unknown>,
  freightUsd: number,
): Promise<void> {
  try {
    const current = await prisma.product.findUnique({
      where: { id: productId },
      select: { productData: true },
    });
    const meta = parseMeta(current?.productData);
    meta.mlChileFreight = freightRecord;

    await prisma.product.update({
      where: { id: productId },
      data: {
        shippingCost: freightUsd,
        productData: JSON.stringify(meta) as any,
      },
    });
    logger.info('[ORDER-TIME-FREIGHT] Persisted re-quoted freight', { productId, freightUsd });
  } catch (err: any) {
    logger.warn('[ORDER-TIME-FREIGHT] Failed to persist re-quoted freight (non-fatal)', {
      productId,
      error: err?.message,
    });
  }
}

/**
 * Check if an order is profitable given the real freight cost at order time.
 *
 * Uses the canonical fee rates:
 *  - ML Chile fee: 13.9% of sale price
 *  - Payment fee: 3.49% + $0.49 USD
 *  - Import duty CL: 19% IVA on (product + freight)
 *
 * Returns `allowed: false` with reason `AUTO_PURCHASE_BLOCKED_BY_FREIGHT` if
 * the order would result in a loss.
 */
export interface OrderTimeProfitabilityCheck {
  allowed: boolean;
  status:
    | 'PROFITABLE'
    | 'AUTO_PURCHASE_BLOCKED_BY_FREIGHT'
    | 'ORDER_REQUIRES_SHIPPING_RECHECK'
    | 'INSUFFICIENT_DATA';
  netProfitUsd: number;
  breakdown: {
    salePriceUsd: number;
    supplierCostUsd: number;
    freightUsd: number;
    importDutyUsd: number;
    mlFeeUsd: number;
    paymentFeeUsd: number;
    totalCostUsd: number;
    netProfitUsd: number;
    marginPct: number;
  };
  reason?: string;
}

/** ML Chile fee rate (13.9% plan clásico) */
const ML_FEE_PCT = 0.139;
/** PayPal/Mercado Pago payment fee */
const PAYMENT_FEE_PCT = 0.0349;
const PAYMENT_FEE_FIXED_USD = 0.49;
/** Chile IVA on product + freight for low-value imports */
const CL_IMPORT_DUTY_PCT = 0.19;
/** Minimum acceptable net margin (configurable via env) */
const MIN_MARGIN_PCT = parseFloat(process.env.ORDER_MIN_MARGIN_PCT || '0.05');

export function checkOrderTimeProfitability(params: {
  salePriceUsd: number;
  supplierCostUsd: number;
  freightUsd: number;
  shippingTruthStatus: ShippingTruthStatus;
}): OrderTimeProfitabilityCheck {
  const { salePriceUsd, supplierCostUsd, freightUsd, shippingTruthStatus } = params;

  if (
    !Number.isFinite(salePriceUsd) || salePriceUsd <= 0 ||
    !Number.isFinite(supplierCostUsd) || supplierCostUsd < 0
  ) {
    return {
      allowed: true, // Don't block when data is insufficient — log and continue
      status: 'INSUFFICIENT_DATA',
      netProfitUsd: 0,
      breakdown: {
        salePriceUsd,
        supplierCostUsd,
        freightUsd,
        importDutyUsd: 0,
        mlFeeUsd: 0,
        paymentFeeUsd: 0,
        totalCostUsd: 0,
        netProfitUsd: 0,
        marginPct: 0,
      },
      reason: 'Insufficient price data to run profitability check',
    };
  }

  const importDutyUsd = (supplierCostUsd + freightUsd) * CL_IMPORT_DUTY_PCT;
  const mlFeeUsd = salePriceUsd * ML_FEE_PCT;
  const paymentFeeUsd = salePriceUsd * PAYMENT_FEE_PCT + PAYMENT_FEE_FIXED_USD;
  const totalCostUsd = supplierCostUsd + freightUsd + importDutyUsd + mlFeeUsd + paymentFeeUsd;
  const netProfitUsd = salePriceUsd - totalCostUsd;
  const marginPct = netProfitUsd / salePriceUsd;

  const breakdown = {
    salePriceUsd: Math.round(salePriceUsd * 100) / 100,
    supplierCostUsd: Math.round(supplierCostUsd * 100) / 100,
    freightUsd: Math.round(freightUsd * 100) / 100,
    importDutyUsd: Math.round(importDutyUsd * 100) / 100,
    mlFeeUsd: Math.round(mlFeeUsd * 100) / 100,
    paymentFeeUsd: Math.round(paymentFeeUsd * 100) / 100,
    totalCostUsd: Math.round(totalCostUsd * 100) / 100,
    netProfitUsd: Math.round(netProfitUsd * 100) / 100,
    marginPct: Math.round(marginPct * 10000) / 100,
  };

  if (netProfitUsd < 0) {
    return {
      allowed: false,
      status: 'AUTO_PURCHASE_BLOCKED_BY_FREIGHT',
      netProfitUsd: breakdown.netProfitUsd,
      breakdown,
      reason: `Order would result in a loss of $${Math.abs(breakdown.netProfitUsd)} USD. freight=$${freightUsd} makes total cost $${breakdown.totalCostUsd} > sale $${breakdown.salePriceUsd}`,
    };
  }

  if (marginPct < MIN_MARGIN_PCT && shippingTruthStatus !== 'SHIPPING_TRUTH_OK') {
    return {
      allowed: false,
      status: 'ORDER_REQUIRES_SHIPPING_RECHECK',
      netProfitUsd: breakdown.netProfitUsd,
      breakdown,
      reason: `Margin ${breakdown.marginPct}% is below minimum ${MIN_MARGIN_PCT * 100}% and freight truth is ${shippingTruthStatus} — manual review required`,
    };
  }

  return {
    allowed: true,
    status: 'PROFITABLE',
    netProfitUsd: breakdown.netProfitUsd,
    breakdown,
  };
}
