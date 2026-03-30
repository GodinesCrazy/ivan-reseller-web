/**
 * Shared types for opportunity finder pipeline.
 * Used by opportunity-finder, and by discovery/enrichment modules when extracted.
 */

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

export interface OpportunityItem {
  productId?: string;
  title: string;
  sourceMarketplace: 'aliexpress';
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
  category?: string;
  shippingCost?: number;
  importTax?: number;
  totalCost?: number;
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
  supplierScorePct?: number;
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
  supplierScorePct?: number;
}
