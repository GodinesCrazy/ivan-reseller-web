import {
  COMMERCIAL_FINALIST_FLOOR_DEFAULTS,
  evaluateCommercialFinalistFloor,
} from '../commercial-finalist-floor.service';
import type { CanonicalHeroMetricsSnapshot, CanonicalSimulationQualityMetrics } from '../types';

const strongHero: CanonicalHeroMetricsSnapshot = {
  subjectAreaRatio: 0.7,
  subjectWidthRatio: 0.82,
  subjectHeightRatio: 0.85,
  extentBalance: 0.95,
  trimThreshold: 14,
};

const weakHero: CanonicalHeroMetricsSnapshot = {
  subjectAreaRatio: 0.4,
  subjectWidthRatio: 0.5,
  subjectHeightRatio: 0.48,
  extentBalance: 0.7,
  trimThreshold: 14,
};

function makeQ(overrides: Partial<CanonicalSimulationQualityMetrics>): CanonicalSimulationQualityMetrics {
  return {
    deadSpaceRatio: 0.3,
    centerSignalRatio: 0.5,
    globalLuminanceStdev: 35,
    edgeTextureStdev: 30,
    washoutIndex: 0.28,
    silhouetteStrength: 60,
    readabilityEstimate: 65,
    ...overrides,
  };
}

describe('commercial-finalist-floor.service', () => {
  it('passes a strong P84-like winner', () => {
    const r = evaluateCommercialFinalistFloor({
      preferenceScore: 128_938.67,
      q: makeQ({
        deadSpaceRatio: 0.2961,
        centerSignalRatio: 0.5696,
        washoutIndex: 0.3,
        silhouetteStrength: 62.02,
        readabilityEstimate: 65.67,
      }),
      heroMetrics: strongHero,
      thresholds: COMMERCIAL_FINALIST_FLOOR_DEFAULTS,
    });
    expect(r.pass).toBe(true);
    expect(r.failureReasons).toHaveLength(0);
  });

  it('fails closed when best finalist is still weak (relative winner, absolute loser)', () => {
    const r = evaluateCommercialFinalistFloor({
      preferenceScore: 54_439.39,
      q: makeQ({
        centerSignalRatio: 0.1113,
        washoutIndex: 0.456,
        silhouetteStrength: 40.54,
        readabilityEstimate: 49.26,
        deadSpaceRatio: 0.2984,
      }),
      heroMetrics: strongHero,
      thresholds: COMMERCIAL_FINALIST_FLOOR_DEFAULTS,
    });
    expect(r.pass).toBe(false);
    expect(r.failureReasons.length).toBeGreaterThan(0);
    expect(r.failureReasons.some((x) => x.startsWith('floor_readability_'))).toBe(true);
    expect(r.failureReasons.some((x) => x.startsWith('floor_center_signal_'))).toBe(true);
    expect(r.failureReasons.some((x) => x.startsWith('floor_preference_score_'))).toBe(true);
    expect(r.failureReasons.some((x) => x.startsWith('floor_washout_'))).toBe(true);
    expect(r.failureReasons.some((x) => x.startsWith('floor_silhouette_'))).toBe(true);
  });

  it('fails on washout and dead space when thresholds exceeded', () => {
    const r = evaluateCommercialFinalistFloor({
      preferenceScore: 200_000,
      q: makeQ({
        washoutIndex: 0.7,
        deadSpaceRatio: 0.65,
        centerSignalRatio: 0.4,
        silhouetteStrength: 80,
        readabilityEstimate: 80,
      }),
      heroMetrics: weakHero,
      thresholds: COMMERCIAL_FINALIST_FLOOR_DEFAULTS,
    });
    expect(r.pass).toBe(false);
    expect(r.failureReasons.some((x) => x.includes('washout'))).toBe(true);
    expect(r.failureReasons.some((x) => x.includes('dead_space'))).toBe(true);
    expect(r.failureReasons.some((x) => x.includes('subject_area'))).toBe(true);
  });
});
