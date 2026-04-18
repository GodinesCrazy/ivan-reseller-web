/**
 * CJ → eBay USA — AI Opportunity Discovery (FASE 3G / 3G.1).
 * Shared types for trend discovery, candidate matching, pricing, scoring, and shortlist.
 * No legacy Product/Order/Sale references; no AliExpress.
 */

// ====================================
// DATA QUALITY / SOURCE LAYER (3G.1)
// ====================================

/** Origin quality of any data signal. Persisted on each candidate. */
export type DataSourceType = 'REAL' | 'ESTIMATED' | 'HYBRID' | 'MOCK';

/** Composite recommendation confidence driven by data quality + score. */
export type RecommendationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

/** Suitability verdict for a newly-created eBay account. */
export type StarterSuitability =
  | 'GOOD_FOR_STARTER'
  | 'CAUTION_FOR_STARTER'
  | 'NOT_RECOMMENDED_FOR_STARTER';

/** Full result from the market observed-price service (real or estimated). */
export interface MarketObservedPriceResult {
  observedMinPrice: number | null;
  observedMedianPrice: number | null;
  observedMaxPrice: number | null;
  /** Interquartile-range midpoint — best single reference price. */
  observedTypicalPrice: number | null;
  /** 0.0–1.0: how trustworthy this price estimate is. */
  observedPriceConfidence: number;
  marketSource: DataSourceType;
  evidenceSummary: string;
  /** Total active eBay listings found (0 = fallback/estimated). */
  listingCount: number;
}

/** Per-candidate data quality breakdown — shown as badges in the UI. */
export interface CandidateDataQuality {
  trendSourceType: DataSourceType;
  marketPriceSourceType: DataSourceType;
  /** REAL if CJ freight API confirmed, ESTIMATED otherwise. */
  shippingSourceType: DataSourceType;
  /** 0–100: composite quality of all underlying data signals. */
  dataConfidenceScore: number;
  recommendationConfidence: RecommendationConfidence;
  evidenceSummary: string;
  starterSuitability: StarterSuitability;
}

// ====================================
// TREND / SEED LAYER
// ====================================

export type TrendSeedSource = 'MOCK_TREND' | 'EBAY_RESEARCH' | 'MANUAL';

export interface TrendSeed {
  keyword: string;
  category?: string;
  productConcept?: string;
  /** 0.0–1.0: how confident we are this is a real market trend. */
  trendConfidence: number;
  /** Origin of this seed (for traceability). */
  source: TrendSeedSource;
  /** Raw signal metadata from the provider (for debug / future use). */
  rawSignal?: Record<string, unknown>;
  /** Human-readable summary of the evidence behind this seed (3G.1). */
  evidenceSummary?: string;
}

// ====================================
// DISCOVERY RUN CONFIG
// ====================================

export type OpportunityRunMode = 'STARTER' | 'STANDARD';

export interface OpportunityRunSettings {
  mode: OpportunityRunMode;
  maxSeedsPerRun: number;
  maxCandidatesPerSeed: number;
  shortlistSize: number;
  /** Minimum totalScore (0–100) for a candidate to make the shortlist. */
  minScoreForShortlist: number;
  /** Minimum net margin % to consider a candidate viable. */
  minMarginPctFilter: number;
  /** Maximum shipping cost USD to consider a candidate viable. */
  maxShippingUsdFilter: number;
  /** Weights for scoring sub-components (must sum to 100). */
  scoringWeights: ScoringWeights;
  starterModeConfig?: StarterModeConfig;
}

export interface StarterModeConfig {
  /** Hard-cap max variants per product. */
  maxVariants: number;
  /** Reject products with riskScore above this threshold. */
  maxRiskScore: number;
  /** Minimum required margin in STARTER mode. */
  minMarginPctStarter: number;
  /** Penalty multiplier applied to totalScore for "risky" categories. */
  riskyCategoyPenalty: number;
  /** Categories to penalize (e.g. "electronics", "fragile"). */
  penalizedCategories: string[];
}

export interface ScoringWeights {
  demand: number;        // market signal / trend confidence
  margin: number;        // net margin quality
  competitiveness: number; // price vs market observed
  shippingConfidence: number; // clarity + cost of shipping
  simplicity: number;    // low variant count, easy to manage
  accountRisk: number;   // overall risk for new account
  supplierReliability: number; // stock stability
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  demand: 20,
  margin: 25,
  competitiveness: 15,
  shippingConfidence: 15,
  simplicity: 10,
  accountRisk: 10,
  supplierReliability: 5,
};

export const DEFAULT_STARTER_CONFIG: StarterModeConfig = {
  maxVariants: 5,
  maxRiskScore: 30,
  minMarginPctStarter: 18,
  riskyCategoyPenalty: 0.6,
  penalizedCategories: ['electronics', 'fragile', 'battery', 'lithium', 'weapon', 'knife', 'heavy'],
};

export const DEFAULT_RUN_SETTINGS: OpportunityRunSettings = {
  mode: 'STARTER',
  maxSeedsPerRun: 8,
  maxCandidatesPerSeed: 3,
  shortlistSize: 10,
  minScoreForShortlist: 35,
  minMarginPctFilter: 15,
  maxShippingUsdFilter: 12,
  scoringWeights: DEFAULT_SCORING_WEIGHTS,
  starterModeConfig: DEFAULT_STARTER_CONFIG,
};

// ====================================
// CJ MATCH LAYER
// ====================================

export interface CjCandidateMatch {
  seed: TrendSeed;
  cjProductId: string;
  cjProductTitle: string;
  images: string[];
  selectedVariant: {
    cjSku: string;
    cjVid?: string;
    attributes: Record<string, string>;
    unitCostUsd: number;
    stock: number;
  };
  totalVariants: number;
  shipping: {
    amountUsd: number;
    confidence: 'KNOWN' | 'ESTIMATED' | 'UNKNOWN';
    daysMin?: number;
    daysMax?: number;
    serviceName?: string;
  } | null;
  /** Null means shipping was not available — candidate may be discarded. */
  shippingViable: boolean;
}

// ====================================
// PRICING LAYER
// ====================================

export interface CjOpportunityPricingResult {
  supplierCostUsd: number;
  shippingUsd: number;
  ebayFeeUsd: number;
  paymentFeeUsd: number;
  incidentBufferUsd: number;
  totalCostUsd: number;
  suggestedPriceUsd: number;
  floorPriceUsd: number;
  netProfitUsd: number;
  netMarginPct: number | null;
  /** Observed competing price (null if not available). */
  marketObservedPriceUsd: number | null;
  /** How our suggested price compares to market: negative = cheaper, positive = more expensive. */
  competitivenessDeltaPct: number | null;
  feeDefaultsApplied: Record<string, number>;
  /** REAL | ESTIMATED | HYBRID | MOCK — origin of the market price data (3G.1). */
  marketPriceSourceType: DataSourceType;
}

// ====================================
// SCORING LAYER
// ====================================

export interface OpportunityScoreBreakdown {
  demandScore: number;           // 0–100
  marginScore: number;           // 0–100
  competitivenessScore: number;  // 0–100
  shippingConfidenceScore: number; // 0–100
  simplicityScore: number;       // 0–100
  accountRiskScore: number;      // 0–100 (higher = lower risk)
  supplierReliabilityScore: number; // 0–100
  /** Weighted total (0–100). */
  totalScore: number;
  /** Human-readable reasons explaining the recommendation. */
  reasons: string[];
  /** Flags from STARTER mode filters (e.g. 'EXCEEDS_MAX_VARIANTS'). */
  starterFlags: string[];
  /** If STARTER mode applied a penalty multiplier. */
  starterPenaltyApplied: boolean;
  // ---- 3G.1 data-quality fields ----
  /** 0–100: quality of underlying data (real API vs estimated vs mock). */
  dataQualityScore: number;
  /** 0–100: how real/verified the market-price and trend signals are. */
  marketRealityScore: number;
  /** Factor by which totalScore was penalized for low data quality (1.0 = no penalty). */
  dataQualityPenaltyFactor: number;
}

// ====================================
// CANDIDATE (FULL RECORD)
// ====================================

export interface OpportunityCandidate {
  id: string;
  runId: string;
  userId: number;
  seed: TrendSeed;
  cjProductId: string;
  cjProductTitle: string;
  cjVariantSku: string;
  cjVariantVid?: string;
  images: string[];
  supplierCostUsd: number;
  shippingUsd: number;
  shippingConfidence: 'KNOWN' | 'ESTIMATED' | 'UNKNOWN';
  shippingDaysMin?: number;
  shippingDaysMax?: number;
  stockCount?: number;
  marketObservedPriceUsd?: number;
  pricing: CjOpportunityPricingResult;
  score: OpportunityScoreBreakdown;
  recommendationReason: string;
  status: 'SHORTLISTED' | 'APPROVED' | 'REJECTED' | 'DEFERRED';
  reviewNotes?: string;
  reviewedAt?: Date;
  handedOffAt?: Date;
  linkedEvaluationId?: number;
  createdAt: Date;
}

// ====================================
// API REQUEST / RESPONSE DTOS
// ====================================

export interface DiscoverOpportunitiesRequest {
  mode?: OpportunityRunMode;
  settings?: Partial<OpportunityRunSettings>;
}

export interface CandidateDecisionRequest {
  notes?: string;
}

export interface OpportunityRunSummary {
  runId: string;
  status: string;
  mode: string;
  seedCount: number;
  candidateCount: number;
  shortlistedCount: number;
  approvedCount: number;
  rejectedCount: number;
  deferredCount: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface CandidateListItem {
  id: string;
  runId: string;
  seedKeyword: string;
  seedSource: string;
  cjProductId: string;
  cjProductTitle: string;
  cjVariantSku: string;
  images: string[];
  supplierCostUsd: number;
  shippingUsd: number;
  shippingConfidence: string;
  shippingDaysMin?: number;
  shippingDaysMax?: number;
  stockCount?: number;
  marketObservedPriceUsd?: number;
  /** @deprecated use pricing.marketPriceSourceType instead */
  marketPriceIsEstimated: boolean;
  pricing: CjOpportunityPricingResult;
  score: OpportunityScoreBreakdown;
  recommendationReason: string;
  status: string;
  reviewNotes?: string;
  reviewedAt?: string;
  handedOffAt?: string;
  createdAt: string;
  // ---- 3G.1 data-quality fields ----
  trendSourceType: DataSourceType;
  marketPriceSourceType: DataSourceType;
  dataConfidenceScore: number;
  recommendationConfidence: RecommendationConfidence;
  starterSuitability: StarterSuitability;
  evidenceSummary?: string;
  marketPriceDetail?: MarketObservedPriceResult;
}
