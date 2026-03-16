/**
 * Fase 1 — Shipping cost: single source of truth for default and effective per-product cost.
 * Use getEffectiveShippingCost() wherever margin/totalCost use product.shippingCost so missing data uses a configurable default (not 0).
 */

import { env } from '../config/env';
import { logger } from '../config/logger';

function getDefaultShippingCostUsd(): number {
  const n = (env as { DEFAULT_SHIPPING_COST_USD?: number }).DEFAULT_SHIPPING_COST_USD;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 5.99;
}

export interface ProductWithShippingCost {
  shippingCost?: number | null;
}

export interface MetadataWithShippingCost {
  shippingCost?: number | null;
}

/**
 * Returns the shipping cost to use for margin/totalCost calculations.
 * Uses product.shippingCost (or metadata.shippingCost) when present and valid; otherwise the configured default (env DEFAULT_SHIPPING_COST_USD, default 5.99).
 */
export function getEffectiveShippingCost(
  product: ProductWithShippingCost,
  metadata?: MetadataWithShippingCost | null,
  options?: { defaultIfMissing?: number }
): number {
  const fromProduct = product?.shippingCost;
  const fromMeta = metadata?.shippingCost;
  const val = fromProduct ?? fromMeta;
  if (val != null && typeof val === 'number' && Number.isFinite(val) && val >= 0) {
    return val;
  }
  const defaultVal = options?.defaultIfMissing ?? getDefaultShippingCostUsd();
  logger.debug('[SHIPPING] Using default cost (product has no shippingCost)', {
    defaultUsd: defaultVal,
    productId: (product as any)?.id,
  });
  return defaultVal;
}

/**
 * Default shipping cost in USD (for use in modules that cannot import env at top level).
 */
export function getDefaultShippingCost(): number {
  return getDefaultShippingCostUsd();
}
