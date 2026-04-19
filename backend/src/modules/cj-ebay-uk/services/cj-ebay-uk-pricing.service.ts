/**
 * CJ → eBay UK — pricing engine.
 *
 * KEY UK ADAPTATIONS vs USA:
 * 1. GBP currency: all costs converted USD→GBP at fxRateUsdToGbp.
 * 2. VAT deduction: eBay UK acts as marketplace facilitator for B2C orders ≤ £135.
 *    eBay collects 20% VAT from buyer and deducts from seller payout.
 *    VAT deducted = listedPriceGbp × (ukVatPct / (100 + ukVatPct))
 *    e.g. at 20%: £100 listed → £16.67 VAT deducted, £83.33 net-of-VAT.
 * 3. eBay UK FVF default ~12.8% (lower than USA ~13.25%).
 * 4. Suggested price formula accounts for VAT in the denominator.
 *
 * Pricing model (all in GBP):
 *   supplierCostGbp = supplierCostUsd × fx
 *   shippingGbp     = shippingUsd × fx
 *   incidentBuffer  = (supplierCostGbp + shippingGbp) × incidentBufferPct/100
 *   ebayFee         = listedPrice × ebayFeePct/100
 *   paymentFee      = listedPrice × paymentFeePct/100 + paymentFixedFeeGbp
 *   vatDeducted     = listedPrice × (vatPct / (100 + vatPct))   [if vatMarketplaceFacilitated]
 *   totalCost       = supplierCostGbp + shippingGbp + incidentBuffer + ebayFee + paymentFee + vatDeducted
 *   netProfit       = listedPrice - totalCost
 *   netMarginPct    = netProfit / listedPrice × 100
 *
 * Suggested price (solve for P such that both thresholds are satisfied):
 *   Let fixedCost = supplierCostGbp + shippingGbp + incidentBuffer + paymentFixedFeeGbp
 *   Let rateFactor = 1 - ebayFeePct/100 - paymentFeePct/100 - vatFactor
 *   P_margin  >= fixedCost / (rateFactor - minMarginPct/100)
 *   P_profit  >= (fixedCost + minProfitGbp) / rateFactor
 *   suggestedPrice = max(P_margin, P_profit) that is finite and > 0
 */

import {
  PRICING_UK_DEFAULT_EBAY_FEE_PCT,
  UK_VAT_STANDARD_RATE_PCT,
} from '../cj-ebay-uk.constants';

/** ~2.9% variable + fixed £0.25 typical UK payment processor. */
const PRICING_UK_DEFAULT_PAYMENT_FEE_PCT = 2.9;
const PRICING_UK_DEFAULT_PAYMENT_FIXED_FEE_GBP = 0.25;
const PRICING_UK_DEFAULT_INCIDENT_BUFFER_PCT = 2;
const PRICING_UK_DEFAULT_FX_RATE_USD_TO_GBP = 0.79;

export interface UkPricingSettingsInput {
  fxRateUsdToGbp: number;
  ukVatPct: number;
  vatMarketplaceFacilitated: boolean;
  incidentBufferPct: number | null;
  defaultEbayFeePct: number | null;
  defaultPaymentFeePct: number | null;
  defaultPaymentFixedFeeGbp: number | null;
  minMarginPct: number | null;
  minProfitGbp: number | null;
}

export interface UkPricingSettingsResolved {
  fxRateUsdToGbp: number;
  ukVatPct: number;
  vatMarketplaceFacilitated: boolean;
  ebayFeePctEffective: number;
  paymentFeePctEffective: number;
  paymentFixedFeeGbpEffective: number;
  incidentBufferPctEffective: number;
  defaultsApplied: Record<string, number>;
}

export interface UkPricingBreakdown {
  supplierCostUsd: number;
  supplierCostGbp: number;
  shippingUsd: number;
  shippingGbp: number;
  fxRateUsed: number;
  ebayFeeGbp: number;
  paymentFeeGbp: number;
  incidentBufferGbp: number;
  vatDeductedGbp: number;
  totalCostGbp: number;
  listPriceGbp: number | null;
  netProfitGbp: number | null;
  netMarginPct: number | null;
  suggestedPriceGbp: number;
  minimumAllowedPriceGbp: number;
  feeDefaultsApplied: Record<string, number>;
  pricingContext: {
    thresholdsConfigured: boolean;
    pricingMode: 'target_margin_profit' | 'cost_floor_only';
    configuredThresholds: { minMarginPct: number | null; minProfitGbp: number | null };
    missingThresholdFields: string[];
    feeConfigSource: 'account' | 'defaults' | 'mixed';
    vatHandled: boolean;
    ukVatPct: number;
    fxRateUsdToGbp: number;
  };
}

export function resolveUkFeeSettings(input: UkPricingSettingsInput): UkPricingSettingsResolved {
  const defaultsApplied: Record<string, number> = {};
  let fx = input.fxRateUsdToGbp;
  if (!fx || !Number.isFinite(fx) || fx <= 0) {
    fx = PRICING_UK_DEFAULT_FX_RATE_USD_TO_GBP;
    defaultsApplied.fxRateUsdToGbp = fx;
  }
  let ebay = input.defaultEbayFeePct;
  if (ebay == null || !Number.isFinite(ebay)) {
    ebay = PRICING_UK_DEFAULT_EBAY_FEE_PCT;
    defaultsApplied.defaultEbayFeePct = ebay;
  }
  let payPct = input.defaultPaymentFeePct;
  if (payPct == null || !Number.isFinite(payPct)) {
    payPct = PRICING_UK_DEFAULT_PAYMENT_FEE_PCT;
    defaultsApplied.defaultPaymentFeePct = payPct;
  }
  let payFix = input.defaultPaymentFixedFeeGbp;
  if (payFix == null || !Number.isFinite(payFix)) {
    payFix = PRICING_UK_DEFAULT_PAYMENT_FIXED_FEE_GBP;
    defaultsApplied.defaultPaymentFixedFeeGbp = payFix;
  }
  let inc = input.incidentBufferPct;
  if (inc == null || !Number.isFinite(inc)) {
    inc = PRICING_UK_DEFAULT_INCIDENT_BUFFER_PCT;
    defaultsApplied.incidentBufferPct = inc;
  }
  return {
    fxRateUsdToGbp: fx,
    ukVatPct: input.ukVatPct ?? UK_VAT_STANDARD_RATE_PCT,
    vatMarketplaceFacilitated: input.vatMarketplaceFacilitated ?? true,
    ebayFeePctEffective: ebay,
    paymentFeePctEffective: payPct,
    paymentFixedFeeGbpEffective: payFix,
    incidentBufferPctEffective: inc,
    defaultsApplied,
  };
}

export function computeUkPricingPreview(params: {
  supplierCostUsd: number;
  shippingUsd: number;
  listPriceGbp: number | null;
  settings: UkPricingSettingsInput;
}): UkPricingBreakdown {
  const { supplierCostUsd, shippingUsd } = params;
  const fees = resolveUkFeeSettings(params.settings);

  const fx = fees.fxRateUsdToGbp;
  const supplierCostGbp = supplierCostUsd * fx;
  const shippingGbp = shippingUsd * fx;
  const incidentBufferGbp = (supplierCostGbp + shippingGbp) * (fees.incidentBufferPctEffective / 100);

  // VAT factor: fraction of listed price collected as VAT by eBay
  const vatFactor = fees.vatMarketplaceFacilitated
    ? fees.ukVatPct / (100 + fees.ukVatPct)
    : 0;

  // Fixed cost (not price-dependent)
  const fixedCostGbp = supplierCostGbp + shippingGbp + incidentBufferGbp + fees.paymentFixedFeeGbpEffective;

  // Rate factor: fraction of listed price retained after eBay fee + payment % + VAT deduction
  const rateFactor =
    1 -
    fees.ebayFeePctEffective / 100 -
    fees.paymentFeePctEffective / 100 -
    vatFactor;

  // Suggested price — minimum P satisfying both thresholds
  const { minMarginPct, minProfitGbp } = params.settings;
  const thresholdsConfigured = minMarginPct != null && minProfitGbp != null;
  const candidates: number[] = [];

  if (minMarginPct != null && Number.isFinite(minMarginPct)) {
    const denom = rateFactor - minMarginPct / 100;
    if (denom > 0) {
      candidates.push(fixedCostGbp / denom);
    }
  }
  if (minProfitGbp != null && Number.isFinite(minProfitGbp) && rateFactor > 0) {
    candidates.push((fixedCostGbp + minProfitGbp) / rateFactor);
  }

  const suggestedPriceGbp =
    candidates.filter((c) => Number.isFinite(c) && c > 0).reduce((a, b) => Math.max(a, b), 0) ||
    fixedCostGbp / Math.max(rateFactor, 0.01);

  const minimumAllowedPriceGbp = suggestedPriceGbp;

  // Calculate breakdown at listPrice if given
  const P = params.listPriceGbp;
  let ebayFeeGbp = 0;
  let paymentFeeGbp = 0;
  let vatDeductedGbp = 0;
  let totalCostGbp = 0;
  let netProfitGbp: number | null = null;
  let netMarginPct: number | null = null;

  if (P != null && P > 0) {
    ebayFeeGbp = P * (fees.ebayFeePctEffective / 100);
    paymentFeeGbp = P * (fees.paymentFeePctEffective / 100) + fees.paymentFixedFeeGbpEffective;
    vatDeductedGbp = P * vatFactor;
    totalCostGbp = supplierCostGbp + shippingGbp + incidentBufferGbp + ebayFeeGbp + paymentFeeGbp + vatDeductedGbp;
    netProfitGbp = P - totalCostGbp;
    netMarginPct = (netProfitGbp / P) * 100;
  } else {
    // Use suggested price for cost display
    ebayFeeGbp = suggestedPriceGbp * (fees.ebayFeePctEffective / 100);
    paymentFeeGbp =
      suggestedPriceGbp * (fees.paymentFeePctEffective / 100) + fees.paymentFixedFeeGbpEffective;
    vatDeductedGbp = suggestedPriceGbp * vatFactor;
    totalCostGbp =
      supplierCostGbp + shippingGbp + incidentBufferGbp + ebayFeeGbp + paymentFeeGbp + vatDeductedGbp;
  }

  const missingThresholds: string[] = [];
  if (minMarginPct == null) missingThresholds.push('minMarginPct');
  if (minProfitGbp == null) missingThresholds.push('minProfitGbp');

  const feeConfiguredCount = [
    params.settings.defaultEbayFeePct,
    params.settings.defaultPaymentFeePct,
    params.settings.defaultPaymentFixedFeeGbp,
    params.settings.incidentBufferPct,
  ].filter((v) => v != null).length;
  const feeConfigSource =
    feeConfiguredCount === 4 ? 'account' : feeConfiguredCount === 0 ? 'defaults' : 'mixed';

  return {
    supplierCostUsd,
    supplierCostGbp: round2(supplierCostGbp),
    shippingUsd,
    shippingGbp: round2(shippingGbp),
    fxRateUsed: fx,
    ebayFeeGbp: round2(ebayFeeGbp),
    paymentFeeGbp: round2(paymentFeeGbp),
    incidentBufferGbp: round2(incidentBufferGbp),
    vatDeductedGbp: round2(vatDeductedGbp),
    totalCostGbp: round2(totalCostGbp),
    listPriceGbp: P != null ? round2(P) : null,
    netProfitGbp: netProfitGbp != null ? round2(netProfitGbp) : null,
    netMarginPct: netMarginPct != null ? round2(netMarginPct) : null,
    suggestedPriceGbp: round2(suggestedPriceGbp),
    minimumAllowedPriceGbp: round2(minimumAllowedPriceGbp),
    feeDefaultsApplied: fees.defaultsApplied,
    pricingContext: {
      thresholdsConfigured,
      pricingMode: thresholdsConfigured ? 'target_margin_profit' : 'cost_floor_only',
      configuredThresholds: { minMarginPct: minMarginPct ?? null, minProfitGbp: minProfitGbp ?? null },
      missingThresholdFields: missingThresholds,
      feeConfigSource,
      vatHandled: fees.vatMarketplaceFacilitated,
      ukVatPct: fees.ukVatPct,
      fxRateUsdToGbp: fx,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
