/**
 * Unified pricing engine per spec:
 * target_price = min(top 5 competitor_prices) * 0.97
 * Margin constraints: minimum 20%, maximum 35%
 * Final guardrail: profit-guard (must exceed total cost).
 */

import { checkProfitGuard } from './profit-guard.service';
import { logger } from '../config/logger';

export type MarketplaceName = 'ebay' | 'amazon' | 'mercadolibre';

export interface PricingEngineInput {
  supplierPriceUsd: number;
  competitorPrices: number[];
  taxUsd?: number;
  shippingUsd?: number;
  marketplace?: MarketplaceName;
  /** Optional: use spec factor (0.97) vs default; set to false to use 1.0 */
  useSpecFactor?: boolean;
}

export interface PricingEngineResult {
  success: boolean;
  suggestedPriceUsd: number;
  marginPercent: number;
  source: 'spec_engine' | 'fallback';
  reason?: string;
  error?: string;
}

const SPEC_COMPETITOR_FACTOR = 0.97;
const MIN_MARGIN_PCT = Number(process.env.PRICING_ENGINE_MIN_MARGIN_PCT || '20');
const MAX_MARGIN_PCT = Number(process.env.PRICING_ENGINE_MAX_MARGIN_PCT || '35');
const TOP_N_PRICES = 5;

/**
 * Compute target price from competitor min * 0.97, then clamp to 20-35% margin band, then apply profit guard.
 */
export function computeSuggestedPrice(input: PricingEngineInput): PricingEngineResult {
  const {
    supplierPriceUsd,
    competitorPrices = [],
    taxUsd = 0,
    shippingUsd = 0,
    useSpecFactor = true,
  } = input;

  if (supplierPriceUsd <= 0) {
    return {
      success: false,
      suggestedPriceUsd: 0,
      marginPercent: 0,
      source: 'fallback',
      error: 'supplierPriceUsd must be positive',
    };
  }

  const topPrices = competitorPrices
    .filter((p) => typeof p === 'number' && p > 0)
    .sort((a, b) => a - b)
    .slice(0, TOP_N_PRICES);

  let candidatePrice: number;
  let source: 'spec_engine' | 'fallback' = 'fallback';

  if (topPrices.length > 0) {
    const competitorMin = topPrices[0];
    const factor = useSpecFactor ? SPEC_COMPETITOR_FACTOR : 1;
    candidatePrice = Math.round(competitorMin * factor * 100) / 100;
    source = 'spec_engine';
  } else {
    candidatePrice = Math.round(supplierPriceUsd * 1.5 * 100) / 100;
  }

  const totalCost = supplierPriceUsd + (taxUsd || 0) + (shippingUsd || 0);
  let marginPercent = candidatePrice > 0 ? ((candidatePrice - totalCost) / candidatePrice) * 100 : 0;

  const minMarginPct = Math.max(0, Math.min(100, MIN_MARGIN_PCT));
  const maxMarginPct = Math.max(minMarginPct, Math.min(100, MAX_MARGIN_PCT));

  if (marginPercent < minMarginPct && totalCost > 0) {
    const minPriceForMargin = totalCost / (1 - minMarginPct / 100);
    candidatePrice = Math.ceil(minPriceForMargin * 100) / 100;
    marginPercent = minMarginPct;
  } else if (marginPercent > maxMarginPct) {
    const maxPriceForMargin = totalCost / (1 - maxMarginPct / 100);
    candidatePrice = Math.floor(maxPriceForMargin * 100) / 100;
    marginPercent = maxMarginPct;
  }

  const profitCheck = checkProfitGuard({
    sellingPriceUsd: candidatePrice,
    supplierPriceUsd,
    taxUsd: taxUsd ?? 0,
    shippingUsd: shippingUsd ?? 0,
  });

  if (!profitCheck.allowed) {
    const minPrice =
      supplierPriceUsd +
      profitCheck.breakdown.platformFeesUsd +
      profitCheck.breakdown.paypalFeesUsd +
      (taxUsd ?? 0) +
      (shippingUsd ?? 0);
    candidatePrice = Math.ceil(minPrice * 1.02 * 100) / 100;
    marginPercent = candidatePrice > 0 ? ((candidatePrice - minPrice) / candidatePrice) * 100 : 0;
    logger.debug('[PRICING-ENGINE] Adjusted below profit guard floor', {
      candidatePrice,
      minPrice,
      marginPercent,
    });
  }

  return {
    success: true,
    suggestedPriceUsd: candidatePrice,
    marginPercent: Math.round(marginPercent * 100) / 100,
    source,
    reason: topPrices.length > 0 ? `min(competitor)*${useSpecFactor ? SPEC_COMPETITOR_FACTOR : 1}, margin ${minMarginPct}-${maxMarginPct}%` : 'no_competitors_fallback',
  };
}
