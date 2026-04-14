/**
 * Phase B — unified supply / discovery contract for opportunity pipeline.
 * Normalizes AliExpress Affiliate vs CJ Open API list hits before OpportunityItem build.
 */

export type OpportunitySupplierPreference = 'aliexpress' | 'cj' | 'auto';

export type CjSupplyEnvMode = 'off' | 'merge' | 'fallback';

/** Per-row commercial truth (no PII). */
export type SupplyTruth = 'confirmed' | 'estimated' | 'listing' | 'unavailable';

/** Phase C — shipping quote lifecycle (CJ selective deep freight). */
export type ShippingEstimateStatus = 'not_quoted' | 'estimated' | 'deep_quoted';

export type ShippingSourceKind =
  | 'default_commerce_settings'
  | 'cj_freight_calculate'
  | 'affiliate_product_detail'
  | 'unknown';

/** Explicit cost layers (never label listing+default as “confirmed landed”). */
export interface SupplyCostSemantics {
  unitCostKind: 'listing_price';
  shippingKind: 'estimated_default' | 'cj_api_deep_quote' | 'affiliate_confirmed';
  landedKind: 'landed_estimate';
}

export interface SupplyRowMeta {
  supplier: 'aliexpress' | 'cj';
  /** Unit product cost basis from listing/API. */
  unitCostTruth: SupplyTruth;
  /** Shipping line item. */
  shippingTruth: SupplyTruth;
  /** Product + shipping when both are estimable. */
  landedCostTruth: 'estimated_partial' | 'estimated';
  /** User preference was this supplier and it produced rows. */
  preferredSupplierSatisfied: boolean;
  /** Primary source failed or empty and another source was used. */
  fallbackUsed: boolean;
  quoteConfidence: 'high' | 'medium' | 'low';
  /** Redacted provider labels only. */
  providersAttempted: string[];
  /** Phase C: coarse shipping quote state for UI / downstream. */
  shippingEstimateStatus?: ShippingEstimateStatus;
  shippingSource?: ShippingSourceKind;
  deepQuotePerformed?: boolean;
  /** ISO time of last successful deep freight call (or cache origin). */
  deepQuoteAt?: string;
  /** When a cached freight value was stored. */
  freightQuoteCachedAt?: string;
  quoteFreshness?: 'fresh' | 'stale';
  costSemantics?: SupplyCostSemantics;
  /** When deep quote failed after attempt; shipping stays estimated. */
  deepQuoteFailureReason?: string;
  /** CJ `logisticName` from chosen freight row (deep quote only). */
  cjFreightMethod?: string;
}

/** Phase C — pipeline summary attached after selective CJ freight (no secrets). */
export interface CjDeepQuotePipelineDiagnostics {
  enabled: boolean;
  maxCandidates: number;
  minSpacingMs: number;
  quantity: number;
  attempted: number;
  succeeded: number;
  servedFromCache: number;
  skippedMultiVariant: number;
  skippedNoProductId: number;
  failed: number;
  rateLimited: boolean;
  degraded: boolean;
  notes: string[];
}

/** Discovery row shape consumed by opportunity-finder (extends affiliate/CJ union). */
export interface SupplyDiscoveryRow {
  title: string;
  price: number;
  priceMin?: number;
  priceMax?: number;
  priceMinSource?: number;
  priceMaxSource?: number;
  priceRangeSourceCurrency?: string;
  currency: string;
  sourcePrice?: number;
  sourceCurrency?: string;
  productUrl: string;
  imageUrl?: string;
  images?: string[];
  productId?: string;
  /** Set when row originates from CJ Open API discovery. */
  supplierSource?: 'cj';
  shippingDaysMax?: number;
  estimatedDeliveryDays?: number;
  shippingCost?: number;
  supplierOrdersCount?: number;
  supplierRating?: number;
  supplierReviewsCount?: number;
  supplierScorePct?: number;
  supplyMeta?: SupplyRowMeta;
}

export interface SupplyDiscoveryDiagnostics {
  sourcesTried: string[];
  preference: OpportunitySupplierPreference;
  cjSupplyMode: CjSupplyEnvMode;
  /** Non-sensitive pipeline notes (no tokens). */
  notes: string[];
  /** True if any provider returned partial or empty after errors. */
  degradedPartial: boolean;
  /** Phase C: filled in opportunity-finder after selective freightCalculate. */
  deepQuote?: CjDeepQuotePipelineDiagnostics;
}

export interface SupplyDiscoveryResult {
  rows: SupplyDiscoveryRow[];
  diagnostics: SupplyDiscoveryDiagnostics;
}

export interface SupplyDiscoveryContext {
  userId: number;
  query: string;
  maxItems: number;
  pageNo: number;
  baseCurrency: string;
  region: string;
  environment: 'sandbox' | 'production';
  defaultShippingUsd: number;
}
