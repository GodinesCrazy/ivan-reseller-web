/**
 * Shared types for opportunity finder pipeline.
 * Used by opportunity-finder, and by discovery/enrichment modules when extracted.
 */

/** Automatic publishability decision for each opportunity. */
export type PublishingDecision =
  | 'PUBLICABLE'
  | 'NO_PUBLICABLE'
  | 'NEEDS_MARKET_DATA'
  | 'NEEDS_ENRICHMENT'
  | 'REJECTED_LOW_MARGIN'
  | 'REJECTED_LOW_SUPPLIER_QUALITY'
  | 'REJECTED_NO_COMPETITOR_EVIDENCE';

export interface PublishingDecisionResult {
  decision: PublishingDecision;
  /** Human-readable list of reasons behind the decision. */
  reasons: string[];
  /** True only when decision === 'PUBLICABLE'. Guards the publish payload. */
  canPublish: boolean;
  checkedAt: string;
  comparablesCount: number;
  dataSource?: string;
  /** Real profit margin as a percentage (0-100). */
  realMarginPct: number;
  /** All-in cost including marketplace fee, payment fee, duties (feesConsidered.totalCost). */
  minimumViablePriceUsd: number;
  suggestedPriceUsd: number;
}

/** Per-field classification for Opportunities UI (backend is source of truth). */
export type CommercialFieldTruth = 'exact' | 'estimated' | 'unavailable';

export interface CommercialTruthMeta {
  /** AliExpress / supplier unit cost basis */
  sourceCost: CommercialFieldTruth;
  suggestedPrice: CommercialFieldTruth;
  profitMargin: CommercialFieldTruth;
  roi: CommercialFieldTruth;
  competitionLevel: CommercialFieldTruth;
  /** e.g. mercadolibre_public_catalog, ebay_browse_application_token */
  competitionSources?: string[];
}

export interface OpportunityFilters {
  query: string;
  maxItems?: number;
  /** 1-based AliExpress Affiliate page (aliexpress.affiliate.product.query page_no). */
  pageNo?: number;
  marketplaces?: Array<'ebay' | 'amazon' | 'mercadolibre'>;
  region?: string;
  environment?: 'sandbox' | 'production';
  skipTrendsValidation?: boolean;
  relaxedMargin?: boolean;
  _collectDiagnostics?: { current: PipelineDiagnostics };
}

export interface PipelineDiagnostics {
  sourcesTried: string[];
  discovered: number;
  normalized: number;
  reason?: 'NO_REAL_PRODUCTS';
  [key: string]: unknown;
}

/** Phase C — normalized economic quote for UI / downstream (optional on each opportunity). */
export interface OpportunityEconomicSupplyQuote {
  currency: string;
  unitCost: number;
  shippingEstimate: number;
  landedCostEstimate: number;
  costConfidence: 'high' | 'medium' | 'low';
  quoteFreshness: 'fresh' | 'stale' | 'unknown';
  shippingEstimateStatus: 'not_quoted' | 'estimated' | 'deep_quoted';
  deepQuotePerformed: boolean;
  deepQuoteAt?: string;
  freightQuoteCachedAt?: string;
  shippingSource?: string;
  costSemantics?: {
    unitCostKind: string;
    shippingKind: string;
    landedKind: string;
  };
  deliveryDaysBandMax?: number;
  /** CJ logistic option label when deep-quoted. */
  cjFreightMethod?: string;
}

/** Phase B — pipeline + row-level supply metadata (no secrets). */
export interface OpportunitySupplyDiagnostics {
  pipelinePreference: 'aliexpress' | 'cj' | 'auto';
  cjSupplyMode: string;
  sourcesTried: string[];
  degradedPartial: boolean;
  notes: string[];
  rowMeta?: {
    supplier: 'aliexpress' | 'cj';
    quoteConfidence: string;
    preferredSupplierSatisfied: boolean;
    fallbackUsed: boolean;
    unitCostTruth: string;
    shippingTruth: string;
    shippingEstimateStatus?: string;
    shippingSource?: string;
    deepQuotePerformed?: boolean;
    deepQuoteAt?: string;
    freightQuoteCachedAt?: string;
    quoteFreshness?: string;
    cjFreightMethod?: string;
    deepQuoteFailureReason?: string;
    costSemantics?: { unitCostKind: string; shippingKind: string; landedKind: string };
  };
  /** Phase C: selective CJ freight summary (from pipeline diagnostics.deepQuote). */
  deepQuote?: Record<string, unknown>;
}

export interface OpportunityItem {
  productId?: string;
  /** When known (e.g. single-variant CJ row), pass to CJ→eBay pipeline as variantId. */
  cjVariantId?: string;
  title: string;
  /** `cjdropshipping` when the discovery row came from CJ Open API (`OPPORTUNITY_CJ_SUPPLY_MODE`). */
  sourceMarketplace: 'aliexpress' | 'cjdropshipping';
  /** Supplier product URL (AliExpress or CJ catalog link). */
  aliexpressUrl: string;
  productUrl?: string;
  image?: string;
  images?: string[];
  costUsd: number;
  costAmount: number;
  costCurrency: string;
  baseCurrency: string;
  price?: number;
  suggestedPriceUsd: number;
  suggestedPriceAmount: number;
  suggestedPriceCurrency: string;
  profitMargin: number;
  roiPercentage: number;
  competitionLevel: 'low' | 'medium' | 'high' | 'unknown';
  marketDemand: string;
  confidenceScore: number;
  targetMarketplaces: string[];
  feesConsidered: Record<string, number>;
  generatedAt: string;
  estimatedFields?: string[];
  estimationNotes?: string[];
  /** Explicit exact vs estimated contract for commercial columns */
  commercialTruth?: CommercialTruthMeta;
  /** Per-marketplace probe outcome (credentials missing, zero hits, API error). */
  competitionDiagnostics?: Array<{
    marketplace: string;
    region: string;
    listingsFound: number;
    competitivePrice: number;
    dataSource?: string;
    probeCode?: string;
    probeDetail?: string;
  }>;
  /** Phase B: how this opportunity was sourced (preference, CJ mode, row quote truth). */
  supplyDiagnostics?: OpportunitySupplyDiagnostics;
  /** Phase C: explicit unit/shipping/landed semantics for supplier cost (backward compatible). */
  economicSupplyQuote?: OpportunityEconomicSupplyQuote;

  category?: string;
  shippingCost?: number;
  importTax?: number;
  totalCost?: number;
  /** Unit supplier cost converted to baseCurrency (UI when costCurrency ≠ baseCurrency). */
  costInBaseCurrency?: number;
  /** Landed supplier cost (product + shipping + import tax) in baseCurrency for margin/ROI consistency. */
  totalCostInBaseCurrency?: number;
  /** Ganancia neta estimada por unidad en moneda base (precio sugerido − costo aterrizado en base). */
  netProfitInBaseCurrency?: number;
  targetCountry?: string;
  trendData?: {
    trend: 'rising' | 'stable' | 'declining';
    searchVolume: number;
    validation: {
      viable: boolean;
      confidence: number;
      reason: string;
    };
  };
  estimatedTimeToFirstSale?: number;
  breakEvenTime?: number;
  /** Supplier filters (spec): orders >= 300, rating >= 4.5, reviews >= 50, shipping <= 15 days, supplier_score >= 90% */
  supplierOrdersCount?: number;
  supplierRating?: number;
  supplierReviewsCount?: number;
  shippingDaysMax?: number;
  /** Días de entrega máx. cotizados (AliExpress hacia destino); alias semántico de shippingDaysMax. */
  estimatedDeliveryDays?: number;
  supplierScorePct?: number;
  /** Automatic publishability decision — computed by the pipeline, not by the operator. */
  publishingDecision?: PublishingDecisionResult;
}

/** Raw product shape returned by discovery (Affiliate API or fallbacks) */
export interface DiscoveryProduct {
  title: string;
  price: number;
  priceMin?: number;
  priceMax?: number;
  priceMinSource?: number;
  priceMaxSource?: number;
  priceRangeSourceCurrency?: string;
  priceSource?: string;
  currency: string;
  sourcePrice?: number;
  sourceCurrency?: string;
  productUrl: string;
  imageUrl?: string;
  productId?: string;
  images?: string[];
  shippingCost?: number;
  source?: string;
  /** Optional supplier metrics for product selection filters (spec) */
  supplierOrdersCount?: number;
  supplierRating?: number;
  supplierReviewsCount?: number;
  shippingDaysMax?: number;
  estimatedDeliveryDays?: number;
  supplierScorePct?: number;
}
