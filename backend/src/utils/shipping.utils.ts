/**
 * Fase 1 — Shipping cost: single source of truth for default and effective per-product cost.
 *
 * Regla de negocio (publicación / márgenes):
 * - Si el proveedor o la API **no entregan un costo de envío real** (null, undefined, o 0 usado como “sin dato”),
 *   se usa **DEFAULT_SHIPPING_COST_USD** (default **5.99 USD**) como supuesto de **paquete pequeño estándar**.
 * - Si `shippingCost > 0` en BD, ese valor es el que manda.
 * Para listados (eBay, ML, etc.) usar `getEffectiveShippingCostForPublish()`.
 */

import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { toNumber } from './decimal.utils';

function getDefaultShippingCostUsd(): number {
  const n = (env as { DEFAULT_SHIPPING_COST_USD?: number }).DEFAULT_SHIPPING_COST_USD;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 5.99;
}

/** Accepts Prisma product (Decimal) or plain object (number). */
export interface ProductWithShippingCost {
  shippingCost?: number | Prisma.Decimal | null;
}

export interface MetadataWithShippingCost {
  shippingCost?: number | Prisma.Decimal | null;
}

export type EffectiveShippingOptions = {
  /** Override USD default when missing (still uses DEFAULT_SHIPPING_COST_USD if omitted). */
  defaultIfMissing?: number;
  /**
   * When true: null, undefined, 0, NaN or negative → default (small-parcel standard).
   * Use for publicación y pricing marketplace cuando 0 significa “sin cotización”, no “envío gratis real”.
   */
  defaultWhenZeroOrMissing?: boolean;
};

/**
 * Returns the shipping cost to use for margin/totalCost calculations.
 * Uses product.shippingCost (or metadata.shippingCost) when present and valid; otherwise the configured default (env DEFAULT_SHIPPING_COST_USD, default 5.99).
 * Accepts Prisma Decimal or number.
 */
export function getEffectiveShippingCost(
  product: ProductWithShippingCost,
  metadata?: MetadataWithShippingCost | null,
  options?: EffectiveShippingOptions
): number {
  const defaultVal = options?.defaultIfMissing ?? getDefaultShippingCostUsd();
  const treatZero = options?.defaultWhenZeroOrMissing === true;

  const fromProduct = product?.shippingCost;
  const fromMeta = metadata?.shippingCost;
  const val = fromProduct ?? fromMeta;
  if (val != null && (typeof val !== 'number' || !Number.isNaN(val))) {
    const num = toNumber(val as Prisma.Decimal | number);
    if (Number.isFinite(num) && num > 0) return num;
    if (Number.isFinite(num) && num === 0 && !treatZero) return 0;
  }
  logger.debug('[SHIPPING] Using default small-parcel shipping (no positive shippingCost)', {
    defaultUsd: defaultVal,
    productId: (product as any)?.id,
    treatZeroAsUnknown: treatZero,
  });
  return defaultVal;
}

/**
 * Envío efectivo para **publicación y márgenes** (eBay, ML, Amazon, colas de publisher):
 * costo real si `shippingCost > 0`; si no hay dato o es 0 (sin cotización), **DEFAULT_SHIPPING_COST_USD** (~5.99) como paquete pequeño.
 */
export type EffectiveShippingForPublishOptions = {
  /** Override env DEFAULT_SHIPPING_COST_USD when shipping is missing or 0 (per-user China→US default). */
  defaultUsd?: number;
};

export function getEffectiveShippingCostForPublish(
  product: ProductWithShippingCost,
  metadata?: MetadataWithShippingCost | null,
  options?: EffectiveShippingForPublishOptions
): number {
  const defaultVal = options?.defaultUsd ?? getDefaultShippingCostUsd();
  return getEffectiveShippingCost(product, metadata, {
    defaultWhenZeroOrMissing: true,
    defaultIfMissing: defaultVal,
  });
}

/**
 * Default shipping cost in USD (for use in modules that cannot import env at top level).
 */
export function getDefaultShippingCost(): number {
  return getDefaultShippingCostUsd();
}
