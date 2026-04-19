/**
 * CJ → eBay UK vertical — HTTP response types.
 * GBP-denominated equivalents of the CJ→eBay USA response types.
 */

export interface CjEbayUkConfigResponse {
  ok: boolean;
  settings: {
    minMarginPct: number | null;
    minProfitGbp: number | null;
    maxShippingUsd: number | null;
    handlingBufferDays: number;
    minStock: number;
    rejectOnUnknownShipping: boolean;
    maxRiskScore: number | null;
    priceChangePctReevaluate: number | null;
    incidentBufferPct: number | null;
    defaultEbayFeePct: number | null;
    defaultPaymentFeePct: number | null;
    defaultPaymentFixedFeeGbp: number | null;
    ukVatPct: number;
    vatMarketplaceFacilitated: boolean;
    fxRateUsdToGbp: number;
    cjPostCreateCheckoutMode: 'MANUAL' | 'AUTO_CONFIRM_PAY';
  };
}

export interface CjEbayUkPricingBreakdown {
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

export interface CjEbayUkOverviewCounts {
  products: number;
  variants: number;
  evaluations: number;
  evaluationsApproved: number;
  evaluationsRejected: number;
  evaluationsPending: number;
  shippingQuotes: number;
  listings: number;
  listingsActive: number;
  orders: number;
  ordersOpen: number;
  ordersWithTracking: number;
  alertsOpen: number;
  profitSnapshots: number;
  tracesLast24h: number;
}
