/**
 * P76 — Canonical marketplace image pipeline types (ML Chile first).
 */

export type MarketplaceImageSlot = 'main' | 'gallery' | 'detail';

export interface SlotPolicyRules {
  minWidth: number;
  minHeight: number;
  maxAspectRatioDeviation: number;
  requireWhiteishBackgroundProxy: boolean;
  maxEdgeTextureStdev: number;
  minEdgeMeanLuminance: number;
}

/** P80 — Pixel-level output integrity (independent of trim); blocks near-blank / near-uniform covers. */
export interface OutputIntegrityGateThresholds {
  sampleMaxDimension: number;
  /** Min fraction of pixels with visible ink (luma/chroma heuristics). */
  minSignalPixelRatio: number;
  /** Fail if fraction of pixels with R,G,B >= nearWhiteRgbThreshold exceeds this. */
  maxNearWhitePixelRatio: number;
  nearWhiteRgbThreshold: number;
  /** When mean luminance is at least this, require luminance stdev (uniform bright field). */
  meanLuminanceTriggersStdevCheck: number;
  minLuminanceStdevWhenMeanHigh: number;
  /** Min (max L − min L) on the sample — rejects flat / invisible silhouette. */
  minLuminanceRange: number;
  /** If hero reports near-full-canvas subject but pixel signal is tiny, treat as trim false-positive risk. */
  minSubjectAreaRatioForTrimSuspicion: number;
  minSignalPixelRatioWhenSubjectFullCanvas: number;
  trimSuspicionMeanLuminanceMin: number;
}

/** P79 — Hero/portada composition thresholds (trim-based subject vs canvas). */
export interface HeroCoverGateThresholds {
  /** Minimum (trimW×trimH)/(W×H). Rejects tiny subject / sea of dead space. */
  minSubjectAreaRatio: number;
  /** Minimum trimW / W */
  minSubjectWidthRatio: number;
  /** Minimum trimH / H */
  minSubjectHeightRatio: number;
  /** min(smaller axis ratio, larger axis ratio) / max(...) — rejects thin-strip heroes. */
  minExtentBalance: number;
  /** Sharp trim threshold (1–99); higher = more aggressive “background” removal. */
  trimThreshold: number;
}

export interface MarketplaceImagePolicyProfile {
  id: string;
  marketplace: 'mercadolibre';
  siteId: string;
  label: string;
  slots: Record<MarketplaceImageSlot, SlotPolicyRules>;
  /** Minimum scores 0–100 for dual gate */
  dualGate: {
    minPolicyFitness: number;
    minConversionFitness: number;
  };
  /** P79 mandatory hero/cover composition gate (in addition to policy + conversion). */
  heroCoverGate: HeroCoverGateThresholds;
  /** P80 mandatory output-integrity gate on buffers selected for publish (direct + remediated). */
  outputIntegrityGate: OutputIntegrityGateThresholds;
  /** Recipe ids in order; must match remediation-recipes registry */
  defaultRemediationRecipeChain: string[];
  compatibleRecipeIds: string[];
}

export interface ImageCandidateScoreBreakdown {
  textLogoRisk: number;
  backgroundSimplicity: number;
  centeringBalance: number;
  productOccupancy: number;
  clutterPackagingRisk: number;
  catalogLook: number;
  conversionAttractiveness: number;
  /**
   * P81 — Ease-of-fix / remediation fitness score (0-100).
   * Higher means this source image is expected to be easier to turn into a strong portada.
   */
  remediationFitness: number;
  remediationPotential: number;
}

export interface ScoredImageCandidate {
  objectKey: string | null;
  url: string;
  scores: ImageCandidateScoreBreakdown;
  policyFitness: number;
  conversionFitness: number;
  combinedScore: number;
  /** P81 — deterministic rationale strings for why this candidate is easy/hard to remediate. */
  remediationFitnessReasons: string[];
}

export interface GateResult {
  pass: boolean;
  failures: string[];
}

export interface DualGateEvaluation {
  policy: GateResult;
  conversion: GateResult;
  bothPass: boolean;
}

export type CanonicalPipelineOutcome =
  | {
      kind: 'raw_ordered';
      orderedUrls: string[];
      trace: CanonicalPipelineTrace;
    }
  | {
      kind: 'pack_ready';
      rootDir: string;
      trace: CanonicalPipelineTrace;
    }
  | {
      kind: 'human_review_required';
      reasons: string[];
      trace: CanonicalPipelineTrace;
    }
  | {
      kind: 'legacy_delegate';
      reasons: string[];
      trace: CanonicalPipelineTrace;
    };

/** Canonical ML pipeline terminal outcome (set when a branch completes). */
export type CanonicalTraceFinalOutcome = 'direct_pass' | 'remediated_pass' | 'human_review_required';

export interface CanonicalRankedCandidateDetail {
  url: string;
  objectKey: string | null;
  policyFitness: number;
  conversionFitness: number;
  combinedScore: number;
  scores: ImageCandidateScoreBreakdown;
  remediationFitnessReasons: string[];
}

export interface CanonicalHeroMetricsSnapshot {
  subjectAreaRatio: number;
  subjectWidthRatio: number;
  subjectHeightRatio: number;
  extentBalance: number;
  trimThreshold: number;
}

export interface CanonicalOutputIntegrityMetricsSnapshot {
  meanLuminance: number;
  luminanceStdev: number;
  signalPixelRatio: number;
  nearWhitePixelRatio: number;
  luminanceRange: number;
  sampleWidth: number;
  sampleHeight: number;
}

export interface CanonicalCandidateGateRecord {
  url: string;
  objectKey: string | null;
  policyPass: boolean;
  conversionPass: boolean;
  policyFailures: string[];
  conversionFailures: string[];
  /** P79 hero gate (same buffer as candidate). */
  heroPass: boolean;
  heroFailures: string[];
  heroMetrics: CanonicalHeroMetricsSnapshot;
  /** P80 output integrity (same buffer as hero). */
  integrityPass: boolean;
  integrityFailures: string[];
  integrityMetrics: CanonicalOutputIntegrityMetricsSnapshot;
}

export interface CanonicalRemediationAttemptDetail {
  recipeId: string;
  candidateUrl: string;
  policyPass: boolean;
  conversionPass: boolean;
  policyFailures: string[];
  conversionFailures: string[];
  heroPass: boolean;
  heroFailures: string[];
  heroMetrics: CanonicalHeroMetricsSnapshot;
  integrityPass: boolean;
  integrityFailures: string[];
  integrityMetrics: CanonicalOutputIntegrityMetricsSnapshot;
}

/** P83 — Calibrated commercial-quality proxies on simulated output (ranking only). */
export interface CanonicalSimulationQualityMetrics {
  deadSpaceRatio: number;
  centerSignalRatio: number;
  globalLuminanceStdev: number;
  edgeTextureStdev: number;
  washoutIndex: number;
  silhouetteStrength: number;
  readabilityEstimate: number;
}

/** P82/P83 — One preview remediation + gate evaluation for trace / ranking. */
export interface CanonicalRemediationSimulationDetail {
  candidateUrl: string;
  objectKey: string | null;
  recipeId: string;
  /** P83 — `low` = shortlist screen; `high` = top-candidate refined preview. */
  fidelityTier: 'low' | 'high';
  simPolicyPass: boolean;
  simConversionPass: boolean;
  simBothPass: boolean;
  simHeroPass: boolean;
  simIntegrityPass: boolean;
  /** P83 — P82-style score before calibration (trace). */
  simScoreBase: number;
  /** Higher is better; P83 calibrated final rank key. */
  simScore: number;
  /** True when simulation dual + hero + integrity all pass (preview-grade). */
  simAllCorePass: boolean;
  simulationQuality: CanonicalSimulationQualityMetrics;
  calibratedReasons: string[];
  heroMetrics: CanonicalHeroMetricsSnapshot;
  integrityMetrics: CanonicalOutputIntegrityMetricsSnapshot;
  policyFailures: string[];
  conversionFailures: string[];
  heroFailures: string[];
  integrityFailures: string[];
}

export interface CanonicalPipelineTrace {
  version: 1;
  profileId: string;
  steps: string[];
  /** Summary row per ranked candidate (backward compatible). */
  rankedCandidates: Array<{ url: string; objectKey: string | null; policyFitness: number; conversionFitness: number }>;
  /** Full score breakdown per ranked candidate (same order as rankedCandidates after sort). */
  rankedCandidateDetails: CanonicalRankedCandidateDetail[];
  /** Enumerated main candidates before scoring. */
  candidateInventory: Array<{ url: string; objectKey: string | null }>;
  /** Dual-gate evaluation on each candidate in combined-score rank order (direct path). */
  directPathGateEvaluations: CanonicalCandidateGateRecord[];
  chosenDirectUrl: string | null;
  remediationAttempts: CanonicalRemediationAttemptDetail[];
  /** Set when the canonical run finishes a terminal branch. */
  finalOutcome: CanonicalTraceFinalOutcome | null;
  /** Winning remediation recipe when finalOutcome is remediated_pass (else null). */
  winningRecipeId: string | null;
  /** P81 — winning remediation source candidate (when applicable). */
  winningRemediationCandidateUrl: string | null;
  /** P82 — preview simulation rows (shortlist × recipes). */
  remediationSimulation: CanonicalRemediationSimulationDetail[];
  /** P82 — best preview row by simScore among shortlist (may be non-passing). */
  remediationSimulationWinner: {
    candidateUrl: string;
    objectKey: string | null;
    recipeId: string;
    simScore: number;
    simAllCorePass: boolean;
  } | null;
  /** P82 — no shortlist preview achieved simAllCorePass. */
  remediationSimulationAllWeak: boolean;
  /** P83 — whether higher-fidelity preview pass ran for top candidates. */
  remediationSimulationHiFiInvoked: boolean;
  /** P83 — count of `fidelityTier: high` rows in `remediationSimulation`. */
  remediationSimulationHiFiRowCount: number;
  /** P84 — final portada preference among multiple gate-passing remediations (default on). */
  finalCoverPreferenceEnabled: boolean;
  /** P84 — max gate-passing finals collected before preference pick (bounded cost). */
  finalCoverPreferenceMaxFinalists: number;
  /** P84 — simulation-plan slots used to prioritize full remediations (subset of max finalists). */
  finalCoverPreferencePlanSlots: number;
  /** P84 — each gate-passing finalist scored for commercial preference (not gates). */
  finalCoverPreferenceFinalists: CanonicalFinalCoverPreferenceFinalistDetail[];
  /** P84 — chosen finalist after preference (subset of finalists when length ≥ 2). */
  finalCoverPreferenceWinner: CanonicalFinalCoverPreferenceWinnerDetail | null;
  /** P84 — short operator-facing beat narrative. */
  finalCoverPreferenceBeatReasons: string[];
  /** P85 — preference winner before absolute commercial floor (same as winner when floor passes or disabled). */
  finalCoverProvisionalWinner: CanonicalFinalCoverPreferenceWinnerDetail | null;
  /** P85 — commercial floor evaluated (false when disabled or direct pass). */
  commercialFinalistFloorEnabled: boolean;
  /** P85 — null when floor not evaluated; true/false after evaluation. */
  commercialFinalistFloorPass: boolean | null;
  /** P85 — structured reasons when provisional winner fails absolute bar. */
  commercialFinalistFloorFailureReasons: string[];
}

/** P84 — Full-res remediated output scored for final portada preference (gates already passed). */
export interface CanonicalFinalCoverPreferenceFinalistDetail {
  candidateUrl: string;
  objectKey: string | null;
  recipeId: string;
  preferenceScore: number;
  finalCoverQuality: CanonicalSimulationQualityMetrics;
  preferenceReasons: string[];
  heroMetrics: CanonicalHeroMetricsSnapshot;
}

/** P84 — Winner summary after preference stage. */
export interface CanonicalFinalCoverPreferenceWinnerDetail {
  candidateUrl: string;
  objectKey: string | null;
  recipeId: string;
  preferenceScore: number;
}

/** Normalized inset crop as fractions of width/height (see `mlImagePipeline.insetCrop`). */
export interface InsetCropFractions {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
