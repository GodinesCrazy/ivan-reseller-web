/**
 * P84 — Compare multiple gate-passing remediated covers and pick the strongest commercial portada.
 * Does not change policy/conversion/hero/integrity gates; ranking only on full-res outputs that already passed.
 */
import type {
  CanonicalFinalCoverPreferenceFinalistDetail,
  CanonicalFinalCoverPreferenceWinnerDetail,
  CanonicalRemediationSimulationDetail,
  CanonicalSimulationQualityMetrics,
} from './types';
import type { ScoredImageCandidate } from './types';
import type { HeroCoverQualityMetrics } from './hero-cover-quality-gate.service';
import type { OutputIntegrityMetrics } from './output-integrity-gate.service';
import { evaluateSimulationQualityOnBuffer } from './simulation-quality-metrics.service';

export function buildFinalCoverFinalistPlanFromSimulation(params: {
  rows: CanonicalRemediationSimulationDetail[];
  maxPlanSlots: number;
  recipeChain: string[];
  insetOverridePresent: boolean;
}): Array<{ candidateUrl: string; objectKey: string | null; recipeId: string; simScore: number }> {
  const chain = new Set(params.recipeChain);
  const best = new Map<
    string,
    { candidateUrl: string; objectKey: string | null; recipeId: string; simScore: number }
  >();
  for (const r of params.rows) {
    if (!chain.has(r.recipeId)) continue;
    if (r.recipeId === 'inset_white_catalog_png' && !params.insetOverridePresent) continue;
    const key = `${r.candidateUrl}|${r.recipeId}`;
    const prev = best.get(key);
    if (!prev || r.simScore > prev.simScore) {
      best.set(key, {
        candidateUrl: r.candidateUrl,
        objectKey: r.objectKey,
        recipeId: r.recipeId,
        simScore: r.simScore,
      });
    }
  }
  return [...best.values()]
    .sort((a, b) => b.simScore - a.simScore)
    .slice(0, Math.max(0, params.maxPlanSlots));
}

export function buildOrderedRemediationAttempts(params: {
  remediationOrder: ScoredImageCandidate[];
  recipeChain: string[];
  insetOverridePresent: boolean;
  plan: Array<{ candidateUrl: string; recipeId: string }> | null;
}): Array<{ candidate: ScoredImageCandidate; recipeId: string }> {
  const seen = new Set<string>();
  const out: Array<{ candidate: ScoredImageCandidate; recipeId: string }> = [];
  const add = (s: ScoredImageCandidate, recipeId: string): void => {
    if (recipeId === 'inset_white_catalog_png' && !params.insetOverridePresent) return;
    const k = `${s.url}|${recipeId}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ candidate: s, recipeId });
  };
  if (params.plan) {
    for (const p of params.plan) {
      const s = params.remediationOrder.find((c) => c.url === p.candidateUrl);
      if (s) add(s, p.recipeId);
    }
  }
  for (const s of params.remediationOrder) {
    for (const recipeId of params.recipeChain) {
      add(s, recipeId);
    }
  }
  return out;
}

/** Pure preference score from metrics (unit-testable). */
export function computeFinalCoverPreferenceScoreFromSignals(params: {
  hero: Pick<
    HeroCoverQualityMetrics,
    'subjectAreaRatio' | 'subjectWidthRatio' | 'subjectHeightRatio' | 'extentBalance'
  >;
  q: CanonicalSimulationQualityMetrics;
}): { preferenceScore: number; preferenceReasons: string[] } {
  const reasons: string[] = [];
  let s = 0;

  s += params.q.readabilityEstimate * 1100;
  reasons.push(`final_readability_${params.q.readabilityEstimate.toFixed(1)}`);

  s += params.q.silhouetteStrength * 520;
  reasons.push(`final_silhouette_${params.q.silhouetteStrength.toFixed(2)}`);

  s += params.q.centerSignalRatio * 58_000;
  reasons.push(`final_center_signal_${params.q.centerSignalRatio.toFixed(4)}`);

  s -= params.q.washoutIndex * 118_000;
  reasons.push(`final_washout_penalty_${params.q.washoutIndex.toFixed(3)}`);

  s -= params.q.deadSpaceRatio * 36_000;
  reasons.push(`final_dead_space_${params.q.deadSpaceRatio.toFixed(3)}`);

  const minWh = Math.min(params.hero.subjectWidthRatio, params.hero.subjectHeightRatio);
  s += minWh * 14_000;
  reasons.push(`final_subject_min_wh_${minWh.toFixed(3)}`);

  s += params.hero.subjectAreaRatio * 26_000;
  reasons.push(`final_subject_area_${params.hero.subjectAreaRatio.toFixed(3)}`);

  s += params.hero.extentBalance * 8000;
  reasons.push(`final_extent_balance_${params.hero.extentBalance.toFixed(3)}`);

  if (params.q.edgeTextureStdev > 38) {
    const over = params.q.edgeTextureStdev - 38;
    s -= over * 620;
    reasons.push(`final_edge_texture_penalty_${over.toFixed(1)}`);
  }

  s = Math.round(s * 100) / 100;
  return { preferenceScore: s, preferenceReasons: reasons.slice(0, 10) };
}

export async function evaluateFinalCoverPreferenceOnBuffer(
  coverBuffer: Buffer,
  hero: HeroCoverQualityMetrics,
  integrity: OutputIntegrityMetrics
): Promise<{ preferenceScore: number; preferenceReasons: string[]; finalCoverQuality: CanonicalSimulationQualityMetrics }> {
  const q = await evaluateSimulationQualityOnBuffer(coverBuffer, hero, integrity);
  const { preferenceScore, preferenceReasons } = computeFinalCoverPreferenceScoreFromSignals({ hero, q });
  return { preferenceScore, preferenceReasons, finalCoverQuality: q };
}

export function compareFinalCoverPreferenceTieBreak(
  a: CanonicalFinalCoverPreferenceFinalistDetail,
  b: CanonicalFinalCoverPreferenceFinalistDetail
): number {
  if (b.preferenceScore !== a.preferenceScore) return b.preferenceScore - a.preferenceScore;
  if (b.heroMetrics.subjectAreaRatio !== a.heroMetrics.subjectAreaRatio) {
    return b.heroMetrics.subjectAreaRatio - a.heroMetrics.subjectAreaRatio;
  }
  const amin = Math.min(a.heroMetrics.subjectWidthRatio, a.heroMetrics.subjectHeightRatio);
  const bmin = Math.min(b.heroMetrics.subjectWidthRatio, b.heroMetrics.subjectHeightRatio);
  if (bmin !== amin) return bmin - amin;
  if (a.recipeId !== b.recipeId) return a.recipeId.localeCompare(b.recipeId);
  return a.candidateUrl.localeCompare(b.candidateUrl);
}

export function selectFinalCoverPreferenceWinner(
  finalists: CanonicalFinalCoverPreferenceFinalistDetail[]
): {
  winner: CanonicalFinalCoverPreferenceWinnerDetail;
  beatReasons: string[];
} {
  if (finalists.length < 1) {
    throw new Error('final_cover_preference_no_finalists');
  }
  const sorted = [...finalists].sort(compareFinalCoverPreferenceTieBreak);
  const w = sorted[0]!;
  const runnerUps = sorted.slice(1, 4);
  const beatReasons: string[] = [
    `compared_${finalists.length}_finalists`,
    `winner_score_${w.preferenceScore.toFixed(2)}`,
    ...w.preferenceReasons.slice(0, 4),
  ];
  for (const r of runnerUps) {
    beatReasons.push(
      `beat_${r.objectKey || 'x'}_${r.recipeId}_by_${(w.preferenceScore - r.preferenceScore).toFixed(2)}`
    );
  }
  return {
    winner: {
      candidateUrl: w.candidateUrl,
      objectKey: w.objectKey,
      recipeId: w.recipeId,
      preferenceScore: w.preferenceScore,
    },
    beatReasons,
  };
}
