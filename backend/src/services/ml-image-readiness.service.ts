/**
 * P107 — Mass-publish image readiness: classification + metadata fragments for analytics.
 */
import type { AutomaticPortadaClassification, P103HeroAttemptResult } from './ml-portada-hero-reconstruction.service';

export type PortadaPublishReadiness = {
  publishAllowedPortada: boolean;
  classification: AutomaticPortadaClassification | null;
  checkedAt: string;
  winningRecipeId: string | null;
  /** P108 — winning alpha-recovery wave when present. */
  winningRecoveryProfileId: string | null;
  /** P109 — winning segmentation + studio prep ids. */
  winningSegmentationVariantId: string | null;
  winningStudioPrepId: string | null;
  winningSourceUrl: string | null;
  sourceTrialCount: number;
  recipeVariantsTriedOnLastSource: number;
  /** P108 — total (recovery × recipe) evaluations on last source. */
  variantEvaluationsOnLastSource: number;
  failClosedReason: string | null;
  supplementHeroConfigured: boolean;
  advancedRecoveryEnabled: boolean;
  recoveryProfilesAttempted: string[];
  segmentationVariantsAttempted: string[];
  studioPrepIdsAttempted: string[];
  /** e.g. p109_autonomous_v2 */
  recoveryEngineVersion: string | null;
  /** Coarse bucket from top gate signal (analytics). */
  dominantFailureCluster: string | null;
  /** True when automatic portada path failed (no supplement fail-closed). */
  autonomousPipelineExhausted: boolean;
  /** True when operator or better source imagery is the practical next step. */
  autonomousImageReviewRecommended: boolean;
  /** Stable label for analytics dashboards. */
  portadaAutomationRecipeFamily: string;
  topRejectionSignals: string[];
};

function dominantFailureClusterFromSignals(signals: string[]): string | null {
  const s = signals[0];
  if (!s) return null;
  if (
    s.includes('collage') ||
    s.includes('fragmentation') ||
    s.includes('vertical_split') ||
    s.includes('seam')
  ) {
    return 'collage_or_multi_panel';
  }
  if (s.includes('sticker') || s.includes('harsh_silhouette') || s.includes('cutout')) {
    return 'sticker_or_cutout_edge';
  }
  if (s.includes('white_background')) {
    return 'white_field_compliance';
  }
  if (s.includes('text') || s.includes('banner') || s.includes('stroke')) {
    return 'text_or_graphic_risk';
  }
  return 'other';
}

export function buildPortadaAutomationReadinessFromP103(
  attempt: P103HeroAttemptResult | null
): PortadaPublishReadiness | null {
  if (!attempt) return null;
  const trials = attempt.trace.trials;
  const last = trials.length > 0 ? trials[trials.length - 1]! : null;
  const lastRecipeTrials = last?.recipeTrials?.length ?? 0;
  const topSignals =
    last?.recipeTrials?.length && last.recipeTrials
      ? (last.recipeTrials[last.recipeTrials.length - 1]?.strictNaturalSignals ?? []).slice(0, 12)
      : (last?.strictNaturalSignals ?? []).slice(0, 12);

  const recoveryList = attempt.trace.recoveryProfilesAttempted ?? [];
  const segList = attempt.trace.segmentationVariantsAttempted ?? [];
  const studioList = attempt.trace.studioPrepIdsAttempted ?? [];
  const advancedOn = attempt.trace.advancedRecoveryEnabled ?? false;
  const engineVer = attempt.trace.recoveryEngineVersion ?? null;
  const p109Shape = segList.length > 1 || studioList.length > 1;
  const recipeFamily = p109Shape
    ? 'p109_seg_x_studio_x_p108_x_p107'
    : advancedOn && recoveryList.length > 1
      ? 'p107_multi_recipe_x_p108_recovery_waves'
      : 'p107_multi_recipe_only';

  const cls = attempt.trace.automaticPortadaClassification ?? null;
  const supplement = attempt.trace.supplementHeroConfigured ?? false;
  const autonomousPipelineExhausted =
    !attempt.ok &&
    !supplement &&
    (cls === 'AUTONOMOUS_V2_RECOVERY_EXHAUSTED' ||
      cls === 'AUTOMATIC_ADVANCED_RECOVERY_EXHAUSTED' ||
      cls === 'IMAGE_SOURCE_INSUFFICIENT_FOR_MARKETPLACE');
  const autonomousImageReviewRecommended = autonomousPipelineExhausted;

  return {
    publishAllowedPortada: attempt.ok,
    classification: attempt.trace.automaticPortadaClassification ?? null,
    checkedAt: new Date().toISOString(),
    winningRecipeId: attempt.winningRecipeId ?? null,
    winningRecoveryProfileId: attempt.winningRecoveryProfileId ?? null,
    winningSegmentationVariantId: attempt.winningSegmentationVariantId ?? null,
    winningStudioPrepId: attempt.winningStudioPrepId ?? null,
    winningSourceUrl: attempt.winningUrl ?? null,
    sourceTrialCount: trials.length,
    recipeVariantsTriedOnLastSource: lastRecipeTrials,
    variantEvaluationsOnLastSource: lastRecipeTrials,
    failClosedReason: attempt.trace.failClosedReason ?? null,
    supplementHeroConfigured: attempt.trace.supplementHeroConfigured ?? false,
    advancedRecoveryEnabled: advancedOn,
    recoveryProfilesAttempted: recoveryList.map(String),
    segmentationVariantsAttempted: segList.map(String),
    studioPrepIdsAttempted: studioList.map(String),
    recoveryEngineVersion: engineVer,
    dominantFailureCluster: dominantFailureClusterFromSignals(topSignals),
    autonomousPipelineExhausted,
    autonomousImageReviewRecommended,
    portadaAutomationRecipeFamily: recipeFamily,
    topRejectionSignals: topSignals,
  };
}

/** Remove supplement-hero fields so P103 uses full supplier automatic path (benchmark / forced automatic). */
export function stripPortadaSupplementHeroFieldsForAutomaticBenchmark(productData: unknown): Record<string, unknown> {
  let base: Record<string, unknown> = {};
  if (typeof productData === 'string' && productData.trim()) {
    try {
      base = JSON.parse(productData) as Record<string, unknown>;
    } catch {
      base = {};
    }
  } else if (productData && typeof productData === 'object') {
    base = { ...(productData as Record<string, unknown>) };
  }
  const prev = { ...((base.mlImagePipeline as Record<string, unknown>) || {}) };
  delete prev.portadaSupplementHeroUrl;
  delete prev.portadaSupplementHeroWorkspaceRelativePath;
  base.mlImagePipeline = prev;
  return base;
}
