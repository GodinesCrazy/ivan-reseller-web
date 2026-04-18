/**
 * CJ → eBay USA — Opportunity Pricing Service (FASE 3G).
 *
 * Clean pricing engine for the opportunity discovery pipeline.
 * Delegates core fee math to cj-ebay-pricing.service (pure utilities),
 * and adds competitiveness analysis vs. observed market prices.
 *
 * No AliExpress. No legacy fee heuristics. No hardcoded overrides.
 */

import {
  resolveFeeSettings,
  computeBreakdownAtListPrice,
  computeMinimumListPrice,
  type CjPricingFeeSettingsInput,
} from './cj-ebay-pricing.service';
import type {
  CjCandidateMatch,
  CjOpportunityPricingResult,
  MarketObservedPriceResult,
} from './cj-ebay-opportunity.types';

/** Accepts either the raw Prisma DTO (numbers) returned by cjEbayConfigService.getOrCreateSettings. */
export type OpportunitySettingsRow = {
  incidentBufferPct: number | null;
  defaultEbayFeePct: number | null;
  defaultPaymentFeePct: number | null;
  defaultPaymentFixedFeeUsd: number | null;
  minMarginPct: number | null;
  minProfitUsd: number | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute suggested price given cost + settings.
 *
 * Strategy: target a margin of `targetMarginPct` (default 30%) above cost floor.
 * If the floor is already above the target-margin price, use the floor + small buffer.
 */
function computeSuggestedPrice(
  supplierCostUsd: number,
  shippingUsd: number,
  feeRow: CjPricingFeeSettingsInput,
  minMarginPct: number | null,
  minProfitUsd: number | null,
  targetMarginPct = 30
): { suggestedPriceUsd: number; floorPriceUsd: number } {
  const fees = resolveFeeSettings(feeRow);
  const floorResult = computeMinimumListPrice({
    supplierCostUsd,
    shippingUsd,
    fees,
    minMarginPct,
    minProfitUsd,
  });

  const floorPriceUsd = floorResult.feasible
    ? roundMoney(floorResult.minimumAllowedPriceUsd)
    : roundMoney(supplierCostUsd + shippingUsd + fees.paymentFixedFeeUsdEffective + 0.01);

  // Compute target-margin price independently.
  const rE = fees.ebayFeePctEffective / 100;
  const rP = fees.paymentFeePctEffective / 100;
  const Ffix = fees.paymentFixedFeeUsdEffective;
  const incRate = fees.incidentBufferPctEffective / 100;
  const incidentBufferUsd = (supplierCostUsd + shippingUsd) * incRate;
  const C = supplierCostUsd + shippingUsd + Ffix + incidentBufferUsd;
  const tM = targetMarginPct / 100;
  const denom = 1 - rE - rP - tM;
  let targetPrice = denom > 0.01 ? roundMoney(C / denom) : floorPriceUsd;

  // Suggested = max(floor, target), rounded up to $.99 cents for eBay optics.
  let suggestedPriceUsd = Math.max(floorPriceUsd, targetPrice);
  suggestedPriceUsd = roundMoney(Math.floor(suggestedPriceUsd) + 0.99);
  if (suggestedPriceUsd < floorPriceUsd) suggestedPriceUsd = roundMoney(floorPriceUsd);

  return { suggestedPriceUsd, floorPriceUsd };
}

/**
 * Compute competitiveness delta.
 *
 * Formula: delta% = ((suggestedPrice - marketPrice) / marketPrice) * 100
 * Negative = our price is cheaper (competitive edge).
 * Positive = our price is higher (potential barrier).
 */
function computeCompetitivenessDelta(
  suggestedPriceUsd: number,
  marketObservedPriceUsd: number | null
): number | null {
  if (marketObservedPriceUsd == null || marketObservedPriceUsd <= 0) return null;
  return roundMoney(((suggestedPriceUsd - marketObservedPriceUsd) / marketObservedPriceUsd) * 100);
}

class CjEbayOpportunityPricingService {
  /**
   * Compute full pricing for a candidate match against user account settings.
   *
   * @param match - The matched CJ candidate.
   * @param settingsRow - User's account settings from DB (Prisma Decimal fields).
   * @param marketPriceResult - Full market price result (real or estimated).
   *   Uses observedTypicalPrice as the competitiveness reference.
   *   Defaults to ESTIMATED with null prices when omitted.
   */
  computePricing(
    match: CjCandidateMatch,
    settingsRow: OpportunitySettingsRow,
    marketPriceResult: MarketObservedPriceResult | null = null,
  ): CjOpportunityPricingResult {
    const marketObservedPriceUsd = marketPriceResult?.observedTypicalPrice ?? null;
    const supplierCostUsd = match.selectedVariant.unitCostUsd;
    const shippingUsd = match.shipping?.amountUsd ?? 0;

    const feeRow: CjPricingFeeSettingsInput = {
      incidentBufferPct: settingsRow.incidentBufferPct,
      defaultEbayFeePct: settingsRow.defaultEbayFeePct,
      defaultPaymentFeePct: settingsRow.defaultPaymentFeePct,
      defaultPaymentFixedFeeUsd: settingsRow.defaultPaymentFixedFeeUsd,
    };
    const minMarginPct = settingsRow.minMarginPct;
    const minProfitUsd = settingsRow.minProfitUsd;

    const { suggestedPriceUsd, floorPriceUsd } = computeSuggestedPrice(
      supplierCostUsd,
      shippingUsd,
      feeRow,
      minMarginPct,
      minProfitUsd
    );

    const fees = resolveFeeSettings(feeRow);
    const breakdown = computeBreakdownAtListPrice({
      supplierCostUsd,
      shippingUsd,
      listPriceUsd: suggestedPriceUsd,
      fees,
    });

    const competitivenessDeltaPct = computeCompetitivenessDelta(
      suggestedPriceUsd,
      marketObservedPriceUsd
    );

    return {
      supplierCostUsd: breakdown.supplierCostUsd,
      shippingUsd: breakdown.shippingUsd,
      ebayFeeUsd: breakdown.ebayFeeUsd,
      paymentFeeUsd: breakdown.paymentFeeUsd,
      incidentBufferUsd: breakdown.incidentBufferUsd,
      totalCostUsd: breakdown.totalCostUsd,
      suggestedPriceUsd,
      floorPriceUsd,
      netProfitUsd: breakdown.netProfitUsd,
      netMarginPct: breakdown.netMarginPct,
      marketObservedPriceUsd,
      competitivenessDeltaPct,
      feeDefaultsApplied: breakdown.feeDefaultsApplied,
      // 3G.1: surface the source type so scoring + UI can badge it correctly
      marketPriceSourceType: marketPriceResult?.marketSource ?? 'ESTIMATED',
    };
  }

  /**
   * Cost-based heuristic fallback (2.6× total cost).
   * Still used when the caller explicitly needs a number without a full
   * MarketObservedPriceResult.  Callers should prefer passing the result
   * of cjEbayMarketObservedPriceService.estimateFromCost() instead.
   */
  estimateMarketObservedPrice(supplierCostUsd: number, shippingUsd: number): number {
    return roundMoney((supplierCostUsd + shippingUsd) * 2.6);
  }
}

export const cjEbayOpportunityPricingService = new CjEbayOpportunityPricingService();
