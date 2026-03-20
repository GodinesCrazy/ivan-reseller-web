/**
 * Phase 53 — Pre-publish validator (mandatory before marketplace publish).
 * Ensures AliExpress Dropshipping getProductInfo passes: purchasable SKU, destination-aware response,
 * shipping cost (API preferred), and profit vs marketplace + payment fees.
 */

import logger from '../config/logger';
import { env } from '../config/env';
import { AppError } from '../middleware/error.middleware';
import { resolveDestination } from './destination.service';
import { aliExpressSupplierAdapter } from './adapters/aliexpress-supplier.adapter';
import { CredentialsManager } from './credentials-manager.service';
import type { AliExpressDropshippingCredentials } from '../types/api-credentials.types';
import {
  aliexpressDropshippingAPIService,
  type DropshippingProductInfo,
} from './aliexpress-dropshipping-api.service';
import costCalculator from './cost-calculator.service';
import { toNumber } from '../utils/decimal.utils';
import { getEffectiveShippingCost } from '../utils/shipping.utils';
import fx from './fx.service';

export type PrePublishMarketplace = 'ebay' | 'mercadolibre' | 'amazon';

export interface PrePublishProductShape {
  id: number;
  aliexpressUrl: string;
  aliexpressSku?: string | null;
  aliexpressPrice?: unknown;
  importTax?: unknown;
  currency?: string | null;
  targetCountry?: string | null;
  shippingCost?: unknown;
}

export interface AssertProductValidForPublishingParams {
  userId: number;
  product: PrePublishProductShape;
  marketplace: PrePublishMarketplace;
  /** Raw credentials object from MarketplaceCredentials (eBay marketplace_id, ML siteId, etc.). */
  credentials: Record<string, unknown> | undefined;
  /** Same listing price used by MarketplaceService.getEffectiveListingPrice. */
  listingSalePrice: number;
}

function fail(detail: string): never {
  throw new AppError(`Product not valid for publishing: ${detail}`, 400);
}

/** Convert supplier-side amount to USD for fee math when listing is USD-based. */
export function toUsd(amount: number, currency: string): number {
  const c = (currency || 'USD').toUpperCase();
  if (!Number.isFinite(amount)) return 0;
  if (c === 'USD' || c === 'US') return amount;
  try {
    return fx.convert(amount, c, 'USD');
  } catch (e: any) {
    logger.warn('[PRE-PUBLISH] FX convert failed; using raw amount as USD', {
      currency: c,
      amount,
      error: e?.message,
    });
    return amount;
  }
}

/** Minimum shipping cost from DS shipping methods (>= 0). */
export function minShippingCostFromApi(info: DropshippingProductInfo): number | null {
  const methods = info.shippingInfo?.availableShippingMethods ?? [];
  const costs = methods
    .map((m) => m.cost)
    .filter((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0);
  if (costs.length === 0) return null;
  return Math.min(...costs);
}

/**
 * Pick a purchasable SKU (non-throwing). Used by Phase 54 risk scan + assert wrapper.
 */
export function selectPurchasableSkuSoft(
  info: DropshippingProductInfo,
  preferredSkuId?: string | null
):
  | { ok: true; skuId: string; unitPrice: number }
  | { ok: false; reason: string } {
  const skus = info.skus;
  if (skus && skus.length > 0) {
    const pref = (preferredSkuId || '').trim();
    if (pref) {
      const s = skus.find((x) => String(x.skuId).trim() === pref);
      if (!s) {
        return { ok: false, reason: `AliExpress SKU "${pref}" not found on listing` };
      }
      if ((s.stock ?? 0) <= 0) {
        return { ok: false, reason: `AliExpress SKU "${pref}" has no stock` };
      }
      return { ok: true, skuId: String(s.skuId), unitPrice: s.salePrice };
    }
    const inStock = skus.filter((x) => (x.stock ?? 0) > 0);
    if (inStock.length === 0) {
      return { ok: false, reason: 'no AliExpress SKU with stock > 0 for this destination' };
    }
    inStock.sort((a, b) => a.salePrice - b.salePrice);
    const best = inStock[0]!;
    return { ok: true, skuId: String(best.skuId), unitPrice: best.salePrice };
  }
  if ((info.stock ?? 0) > 0 && Number.isFinite(info.salePrice) && info.salePrice > 0) {
    return { ok: true, skuId: '', unitPrice: info.salePrice };
  }
  return { ok: false, reason: 'no AliExpress SKU with stock > 0 for this destination' };
}

/**
 * @deprecated Prefer selectPurchasableSkuSoft for precise reasons; this returns null on any failure.
 */
export function selectPurchasableSku(
  info: DropshippingProductInfo,
  preferredSkuId?: string | null
): { skuId: string; unitPrice: number } | null {
  const r = selectPurchasableSkuSoft(info, preferredSkuId);
  return r.ok ? { skuId: r.skuId, unitPrice: r.unitPrice } : null;
}

export function computeProfitAfterFees(
  marketplace: PrePublishMarketplace,
  salePrice: number,
  supplierCostUsd: number,
  shippingUsd: number,
  importTax: number
): { netProfit: number; totalCost: number; breakdown: ReturnType<typeof costCalculator.calculate>['breakdown'] } {
  const { breakdown, netProfit } = costCalculator.calculate(marketplace, salePrice, supplierCostUsd, {
    shippingCost: shippingUsd,
    importTax,
  });
  const totalCost = breakdown.totalCost;
  return { netProfit, totalCost, breakdown };
}

/** Phase 54 — risk bucket for active listing scan */
export type ListingRiskClass = 'SAFE' | 'RISKY' | 'UNPROFITABLE' | 'UNSHIPPABLE' | 'CONFIG';

export interface PrePublishEvaluationResult {
  classification: ListingRiskClass;
  /** SAFE or RISKY — would allow publish under Phase 53 rules */
  passesValidation: boolean;
  message: string;
  usedShippingFallback: boolean;
  listingSalePrice: number;
  marketplace: PrePublishMarketplace;
  netProfit?: number;
  totalCost?: number;
  /** Supplier unit price in USD (after FX) — QA / constrained cycles */
  supplierUnitUsd?: number;
  /** Min API shipping to destination, USD — QA / constrained cycles */
  shippingUsd?: number;
  /** Selected purchasable SKU id from getProductInfo */
  aliexpressSkuId?: string;
  shipCountry?: string;
  aeProductId?: string;
  productId: number;
  listingDbId?: number;
}

export interface EvaluatePrePublishParams extends AssertProductValidForPublishingParams {
  /** When true (Phase 54 scan), run checks even if PRE_PUBLISH_VALIDATION_DISABLED */
  ignoreValidationDisabled?: boolean;
}

/**
 * Non-throwing evaluation for Phase 54 and tooling. Maps outcomes to SAFE / RISKY / UNPROFITABLE / UNSHIPPABLE / CONFIG.
 */
export async function evaluatePrePublishValidation(
  params: EvaluatePrePublishParams
): Promise<PrePublishEvaluationResult> {
  const base = {
    marketplace: params.marketplace,
    listingSalePrice: params.listingSalePrice,
    usedShippingFallback: false,
    productId: params.product.id,
  };

  const skip =
    !params.ignoreValidationDisabled && env.PRE_PUBLISH_VALIDATION_DISABLED;
  if (skip) {
    return {
      ...base,
      classification: 'SAFE',
      passesValidation: true,
      message: 'Pre-publish validation disabled by env (skipped)',
      usedShippingFallback: false,
    };
  }

  const { userId, product, marketplace, credentials, listingSalePrice } = params;

  if (!listingSalePrice || listingSalePrice <= 0) {
    return {
      ...base,
      classification: 'CONFIG',
      passesValidation: false,
      message: 'listing sale price is missing or invalid',
    };
  }

  const aeProductId = aliExpressSupplierAdapter.getProductIdFromUrl(product.aliexpressUrl || '');
  if (!aeProductId) {
    return {
      ...base,
      classification: 'UNSHIPPABLE',
      passesValidation: false,
      message: 'could not parse AliExpress product id from URL',
      aeProductId: undefined,
    };
  }

  const dest = resolveDestination(marketplace, credentials as any);
  const shipCountry = (product.targetCountry || dest.countryCode || 'US').toString().trim().toUpperCase() || 'US';

  // getCredentials devuelve el objeto de credenciales directamente (no { credentials: ... })
  const creds = (await CredentialsManager.getCredentials(
    userId,
    'aliexpress-dropshipping',
    'production'
  )) as AliExpressDropshippingCredentials | null;
  if (!creds?.accessToken) {
    return {
      ...base,
      classification: 'CONFIG',
      passesValidation: false,
      message: 'AliExpress Dropshipping API is not connected; cannot validate supplier',
      shipCountry,
      aeProductId,
    };
  }

  aliexpressDropshippingAPIService.setCredentials(creds);

  let info: DropshippingProductInfo;
  try {
    info = await aliexpressDropshippingAPIService.getProductInfo(aeProductId, {
      localCountry: shipCountry,
      localLanguage: dest.language || 'en',
    });
  } catch (e: any) {
    logger.warn('[PRE-PUBLISH] getProductInfo failed', {
      productId: product.id,
      aeProductId,
      shipCountry,
      error: e?.message,
    });
    return {
      ...base,
      classification: 'UNSHIPPABLE',
      passesValidation: false,
      message: `supplier API error: ${e?.message || 'getProductInfo failed'}`,
      shipCountry,
      aeProductId,
    };
  }

  const skuPick = selectPurchasableSkuSoft(info, product.aliexpressSku);
  if (skuPick.ok === false) {
    return {
      ...base,
      classification: 'UNSHIPPABLE',
      passesValidation: false,
      message: skuPick.reason,
      shipCountry,
      aeProductId,
    };
  }
  const selected = skuPick;

  const supplierCurrency = (info.currency || product.currency || 'USD').toString();
  const supplierUnitUsd = toUsd(selected.unitPrice, supplierCurrency);

  let shippingUsd = minShippingCostFromApi(info);
  let usedShippingFallback = false;
  if (shippingUsd == null) {
    if (env.PRE_PUBLISH_SHIPPING_FALLBACK) {
      shippingUsd = getEffectiveShippingCost(product as import('../utils/shipping.utils').ProductWithShippingCost);
      usedShippingFallback = true;
      logger.info('[PRE-PUBLISH] Using fallback shipping (API returned no method costs)', {
        productId: product.id,
        shippingUsd,
      });
    } else {
      return {
        ...base,
        classification: 'UNSHIPPABLE',
        passesValidation: false,
        message: 'could not determine shipping cost from AliExpress API for this destination',
        usedShippingFallback: false,
        shipCountry,
        aeProductId,
      };
    }
  }

  const importTax = toNumber((product.importTax ?? 0) as Parameters<typeof toNumber>[0]);

  const { netProfit, totalCost, breakdown } = computeProfitAfterFees(
    marketplace,
    listingSalePrice,
    supplierUnitUsd,
    shippingUsd,
    importTax
  );

  const minProfit = env.PRE_PUBLISH_MIN_NET_PROFIT;
  if (netProfit < minProfit) {
    return {
      ...base,
      classification: 'UNPROFITABLE',
      passesValidation: false,
      message: `net profit ${netProfit.toFixed(2)} below minimum ${minProfit} (totalCost ${totalCost.toFixed(2)} vs sale ${listingSalePrice.toFixed(2)})`,
      usedShippingFallback,
      netProfit,
      totalCost,
      supplierUnitUsd,
      shippingUsd,
      aliexpressSkuId: selected.skuId || undefined,
      shipCountry,
      aeProductId,
    };
  }

  const minRatio = env.PRE_PUBLISH_MIN_MARGIN_RATIO;
  if (minRatio > 0 && listingSalePrice > 0 && netProfit / listingSalePrice < minRatio) {
    return {
      ...base,
      classification: 'UNPROFITABLE',
      passesValidation: false,
      message: `margin ratio ${(netProfit / listingSalePrice).toFixed(4)} below minimum ${minRatio}`,
      usedShippingFallback,
      netProfit,
      totalCost,
      supplierUnitUsd,
      shippingUsd,
      aliexpressSkuId: selected.skuId || undefined,
      shipCountry,
      aeProductId,
    };
  }

  const classification: ListingRiskClass = usedShippingFallback ? 'RISKY' : 'SAFE';

  logger.info('[PRE-PUBLISH] evaluated', {
    productId: product.id,
    marketplace,
    aeProductId,
    shipCountry,
    classification,
    netProfit,
    totalCost,
    marketplaceFee: breakdown.marketplaceFee,
    paymentFee: breakdown.paymentFee,
  });

  return {
    classification,
    passesValidation: true,
    message:
      classification === 'RISKY'
        ? 'Valid but shipping cost used DB/env fallback (not from AliExpress API methods)'
        : 'OK',
    usedShippingFallback,
    listingSalePrice,
    marketplace,
    netProfit,
    totalCost,
    supplierUnitUsd,
    shippingUsd,
    aliexpressSkuId: selected.skuId || undefined,
    shipCountry,
    aeProductId,
    productId: product.id,
  };
}

/**
 * Throws AppError with message prefix "Product not valid for publishing" if any check fails.
 */
export async function assertProductValidForPublishing(
  params: AssertProductValidForPublishingParams
): Promise<void> {
  const result = await evaluatePrePublishValidation({
    ...params,
    ignoreValidationDisabled: false,
  });

  if (result.classification === 'SAFE' && result.message.includes('skipped')) {
    return;
  }

  if (!result.passesValidation) {
    fail(result.message);
  }

  if (env.PRE_PUBLISH_REJECT_RISKY && result.classification === 'RISKY') {
    fail(
      'listing classified RISKY (shipping not from AliExpress API lines); set PRE_PUBLISH_REJECT_RISKY=false or fix API shipping'
    );
  }
}
