/**
 * P85 — Absolute commercial-quality floor on the provisional final-cover winner (post P84 preference).
 * P86 — Default thresholds calibrated from a trace-derived starter pair (SKU 32690: Good = preference winner,
 * Weak = runner-up). See docs/P86_*.md and artifacts/ml-calibration/p86_starter_labeled_traces.json.
 * Does not replace or relax Policy / Conversion / Hero / Integrity gates.
 */
import type { CanonicalHeroMetricsSnapshot, CanonicalSimulationQualityMetrics } from './types';

export interface CommercialFinalistFloorThresholds {
  minReadabilityEstimate: number;
  minSilhouetteStrength: number;
  /** Reject if dead space exceeds this (1 - subject presence proxy). */
  maxDeadSpaceRatio: number;
  minCenterSignalRatio: number;
  maxWashoutIndex: number;
  minSubjectAreaRatio: number;
  minPreferenceScore: number;
}

export const COMMERCIAL_FINALIST_FLOOR_DEFAULTS: CommercialFinalistFloorThresholds = {
  /** Between Weak 49.26 and Good 65.67 (P86 starter set). */
  minReadabilityEstimate: 58,
  /** Between Weak 40.54 and Good 62.02. */
  minSilhouetteStrength: 52,
  /** Tightened from 0.52; starter finalists both ~0.30 — leaves slack for other SKUs. */
  maxDeadSpaceRatio: 0.5,
  /** Unchanged from P85; separates Weak 0.1113 from Good 0.57. */
  minCenterSignalRatio: 0.22,
  /** Below Weak 0.456, above Good 0.30 — rejects washy relative winners (P86). */
  maxWashoutIndex: 0.42,
  /** Matches hero gate floor; starter pair did not separate on subject area. */
  minSubjectAreaRatio: 0.42,
  /** Between Weak 54,439 and Good 128,939 (P86). */
  minPreferenceScore: 95_000,
};

function readEnvNumber(key: string, fallback: number, min: number, max: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Env-tunable thresholds; see `backend/env.local.example`. */
export function getCommercialFinalistFloorThresholds(): CommercialFinalistFloorThresholds {
  return {
    minReadabilityEstimate: readEnvNumber('ML_COMMERCIAL_FLOOR_MIN_READABILITY', COMMERCIAL_FINALIST_FLOOR_DEFAULTS.minReadabilityEstimate, 0, 100),
    minSilhouetteStrength: readEnvNumber(
      'ML_COMMERCIAL_FLOOR_MIN_SILHOUETTE',
      COMMERCIAL_FINALIST_FLOOR_DEFAULTS.minSilhouetteStrength,
      0,
      200
    ),
    maxDeadSpaceRatio: readEnvNumber(
      'ML_COMMERCIAL_FLOOR_MAX_DEAD_SPACE',
      COMMERCIAL_FINALIST_FLOOR_DEFAULTS.maxDeadSpaceRatio,
      0.05,
      0.95
    ),
    minCenterSignalRatio: readEnvNumber(
      'ML_COMMERCIAL_FLOOR_MIN_CENTER_SIGNAL',
      COMMERCIAL_FINALIST_FLOOR_DEFAULTS.minCenterSignalRatio,
      0.02,
      0.95
    ),
    maxWashoutIndex: readEnvNumber('ML_COMMERCIAL_FLOOR_MAX_WASHOUT', COMMERCIAL_FINALIST_FLOOR_DEFAULTS.maxWashoutIndex, 0.05, 0.98),
    minSubjectAreaRatio: readEnvNumber(
      'ML_COMMERCIAL_FLOOR_MIN_SUBJECT_AREA',
      COMMERCIAL_FINALIST_FLOOR_DEFAULTS.minSubjectAreaRatio,
      0.2,
      0.95
    ),
    minPreferenceScore: readEnvNumber(
      'ML_COMMERCIAL_FLOOR_MIN_PREFERENCE_SCORE',
      COMMERCIAL_FINALIST_FLOOR_DEFAULTS.minPreferenceScore,
      0,
      2_000_000
    ),
  };
}

export function isCommercialFinalistFloorEnabled(): boolean {
  return (
    process.env.ML_COMMERCIAL_FINALIST_FLOOR !== '0' && process.env.ML_COMMERCIAL_FINALIST_FLOOR !== 'false'
  );
}

export function evaluateCommercialFinalistFloor(params: {
  preferenceScore: number;
  q: CanonicalSimulationQualityMetrics;
  heroMetrics: CanonicalHeroMetricsSnapshot;
  thresholds?: CommercialFinalistFloorThresholds;
}): { pass: boolean; failureReasons: string[] } {
  const t = params.thresholds ?? COMMERCIAL_FINALIST_FLOOR_DEFAULTS;
  const failures: string[] = [];

  if (params.q.readabilityEstimate + 1e-6 < t.minReadabilityEstimate) {
    failures.push(
      `floor_readability_below_min_${t.minReadabilityEstimate}_got_${params.q.readabilityEstimate.toFixed(2)}`
    );
  }
  if (params.q.silhouetteStrength + 1e-6 < t.minSilhouetteStrength) {
    failures.push(
      `floor_silhouette_below_min_${t.minSilhouetteStrength}_got_${params.q.silhouetteStrength.toFixed(2)}`
    );
  }
  if (params.q.deadSpaceRatio - 1e-6 > t.maxDeadSpaceRatio) {
    failures.push(
      `floor_dead_space_above_max_${t.maxDeadSpaceRatio.toFixed(3)}_got_${params.q.deadSpaceRatio.toFixed(3)}`
    );
  }
  if (params.q.centerSignalRatio + 1e-6 < t.minCenterSignalRatio) {
    failures.push(
      `floor_center_signal_below_min_${t.minCenterSignalRatio.toFixed(3)}_got_${params.q.centerSignalRatio.toFixed(4)}`
    );
  }
  if (params.q.washoutIndex - 1e-6 > t.maxWashoutIndex) {
    failures.push(
      `floor_washout_above_max_${t.maxWashoutIndex.toFixed(3)}_got_${params.q.washoutIndex.toFixed(3)}`
    );
  }
  if (params.heroMetrics.subjectAreaRatio + 1e-6 < t.minSubjectAreaRatio) {
    failures.push(
      `floor_subject_area_below_min_${t.minSubjectAreaRatio.toFixed(3)}_got_${params.heroMetrics.subjectAreaRatio.toFixed(3)}`
    );
  }
  if (params.preferenceScore + 1e-6 < t.minPreferenceScore) {
    failures.push(
      `floor_preference_score_below_min_${t.minPreferenceScore}_got_${params.preferenceScore.toFixed(2)}`
    );
  }

  return { pass: failures.length === 0, failureReasons: failures };
}
