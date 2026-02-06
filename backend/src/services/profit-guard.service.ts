/**
 * Profit Guard - Block transactions when profit margin is insufficient.
 * sellingPriceUsd > supplierPriceUsd + platformFees + paypalFees + tax + shipping
 */

import logger from '../config/logger';

export interface ProfitGuardParams {
  sellingPriceUsd: number;
  supplierPriceUsd: number;
  platformFeesUsd?: number;
  paypalFeesUsd?: number;
  taxUsd?: number;
  shippingUsd?: number;
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

const PLATFORM_FEE_PCT = Number(process.env.PROFIT_GUARD_PLATFORM_FEE_PCT || '15');
const PAYPAL_FEE_PCT = Number(process.env.PROFIT_GUARD_PAYPAL_FEE_PCT || '3.49');
const PAYPAL_FIXED_USD = Number(process.env.PROFIT_GUARD_PAYPAL_FIXED_USD || '0.49');

/**
 * Check if transaction meets profit guard requirements.
 */
export function checkProfitGuard(params: ProfitGuardParams): ProfitGuardResult {
  const { sellingPriceUsd, supplierPriceUsd } = params;
  const platformFeesUsd =
    typeof params.platformFeesUsd === 'number'
      ? params.platformFeesUsd
      : (sellingPriceUsd * PLATFORM_FEE_PCT) / 100;
  const paypalFeesUsd =
    typeof params.paypalFeesUsd === 'number'
      ? params.paypalFeesUsd
      : (sellingPriceUsd * PAYPAL_FEE_PCT) / 100 + PAYPAL_FIXED_USD;
  const taxUsd = params.taxUsd ?? 0;
  const shippingUsd = params.shippingUsd ?? 0;

  const totalCostUsd = supplierPriceUsd + platformFeesUsd + paypalFeesUsd + taxUsd + shippingUsd;
  const netProfitUsd = sellingPriceUsd - totalCostUsd;
  const allowed = sellingPriceUsd > totalCostUsd && netProfitUsd > 0;

  const breakdown = {
    sellingPriceUsd,
    supplierPriceUsd,
    platformFeesUsd,
    paypalFeesUsd,
    taxUsd,
    shippingUsd,
    totalCostUsd,
    netProfitUsd,
  };

  if (!allowed) {
    console.log('[PROFIT-GUARD] BLOCKED', breakdown);
    logger.warn('[PROFIT-GUARD] BLOCKED', breakdown);
  }

  return {
    allowed,
    breakdown,
    error: allowed
      ? undefined
      : `Profit guard: sellingPriceUsd ($${sellingPriceUsd.toFixed(2)}) must exceed totalCostUsd ($${totalCostUsd.toFixed(2)})`,
  };
}
