/**
 * CJ → eBay USA — shared DTO shapes for HTTP responses (FASE 3A).
 */

export interface CjEbayHealthResponse {
  ok: boolean;
  module: 'cj-ebay';
  moduleEnabled: boolean;
  timestamp: string;
}

export interface CjEbayOverviewResponse {
  ok: boolean;
  counts: {
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
  };
  note: string;
}

export interface CjEbayConfigResponse {
  ok: boolean;
  settings: {
    minMarginPct: number | null;
    minProfitUsd: number | null;
    maxShippingUsd: number | null;
    handlingBufferDays: number;
    minStock: number;
    rejectOnUnknownShipping: boolean;
    maxRiskScore: number | null;
    priceChangePctReevaluate: number | null;
    incidentBufferPct: number | null;
    defaultEbayFeePct: number | null;
    defaultPaymentFeePct: number | null;
    defaultPaymentFixedFeeUsd: number | null;
    /** Tras createOrder (payType=3): `MANUAL` o `AUTO_CONFIRM_PAY`. */
    cjPostCreateCheckoutMode: 'MANUAL' | 'AUTO_CONFIRM_PAY';
  };
}

export interface CjEbayConfigUpdateResponse {
  ok: boolean;
  settings: CjEbayConfigResponse['settings'];
}
