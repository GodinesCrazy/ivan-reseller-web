/**
 * Profit Guard - Block transactions when profit margin is insufficient.
 *
 * FASE 0 — Fix #1: Ahora delega en canonical-cost-engine para consistencia total.
 * Ya no calcula fees de forma independiente (era causa de divergencia con cost-calculator).
 *
 * Mantiene la misma interfaz pública para compatibilidad con todos los callers existentes.
 */

import logger from '../config/logger';
import { computeCanonicalCost, getMarketplaceFee, PAYMENT_FEE_PCT, PAYMENT_FEE_FIXED_USD } from './canonical-cost-engine.service';

export interface ProfitGuardParams {
  sellingPriceUsd: number;
  supplierPriceUsd: number;
  /** Override fee de plataforma (si se pasa, se respeta; si no, se usa el canónico por marketplace) */
  platformFeesUsd?: number;
  /** Override fee de pago (si no se pasa, usa 3.49% + $0.49 canónico) */
  paypalFeesUsd?: number;
  taxUsd?: number;
  shippingUsd?: number;
  /** Marketplace para usar fee correcto. Default: 'ebay' (conservador) */
  marketplace?: 'ebay' | 'amazon' | 'mercadolibre';
  /** Región para fee regional correcto. Default: 'US' */
  region?: string;
}

export interface ProfitGuardResult {
  allowed: boolean;
  breakdown: {
    sellingPriceUsd: number;
    supplierPriceUsd: number;
    platformFeesUsd: number;
    paypalFeesUsd: number;
    taxUsd: number;
    shippingUsd: number;
    totalCostUsd: number;
    netProfitUsd: number;
  };
  error?: string;
}

/**
 * Check if transaction meets profit guard requirements.
 * Usa fees canónicos (por marketplace/región) para consistencia con canonical-cost-engine.
 */
export function checkProfitGuard(params: ProfitGuardParams): ProfitGuardResult {
  const { sellingPriceUsd, supplierPriceUsd } = params;
  const marketplace = params.marketplace ?? 'ebay';
  const region = params.region ?? 'US';

  // Fee de plataforma: usa el canónico por marketplace/región, o el override si se pasa
  const platformFeeRate = getMarketplaceFee(marketplace, region);
  const platformFeesUsd =
    typeof params.platformFeesUsd === 'number'
      ? params.platformFeesUsd
      : sellingPriceUsd * platformFeeRate;

  // Fee de pago: usa 3.49% + $0.49 canónico, o el override si se pasa
  const paypalFeesUsd =
    typeof params.paypalFeesUsd === 'number'
      ? params.paypalFeesUsd
      : sellingPriceUsd * PAYMENT_FEE_PCT + PAYMENT_FEE_FIXED_USD;

  const taxUsd = params.taxUsd ?? 0;
  const shippingUsd = params.shippingUsd ?? 0;

  const totalCostUsd = supplierPriceUsd + platformFeesUsd + paypalFeesUsd + taxUsd + shippingUsd;
  const netProfitUsd = sellingPriceUsd - totalCostUsd;
  const allowed = sellingPriceUsd > totalCostUsd && netProfitUsd > 0;

  const breakdown = {
    sellingPriceUsd,
    supplierPriceUsd,
    platformFeesUsd: Math.round(platformFeesUsd * 100) / 100,
    paypalFeesUsd: Math.round(paypalFeesUsd * 100) / 100,
    taxUsd,
    shippingUsd,
    totalCostUsd: Math.round(totalCostUsd * 100) / 100,
    netProfitUsd: Math.round(netProfitUsd * 100) / 100,
  };

  if (!allowed) {
    logger.warn('[PROFIT-GUARD] BLOCKED', { ...breakdown, marketplace, region });
  }

  return {
    allowed,
    breakdown,
    error: allowed
      ? undefined
      : `Profit guard: sellingPriceUsd ($${sellingPriceUsd.toFixed(2)}) must exceed totalCostUsd ($${totalCostUsd.toFixed(2)}) [${marketplace}/${region}, fee ${(platformFeeRate * 100).toFixed(2)}%]`,
  };
}
