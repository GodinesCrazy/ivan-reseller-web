import type { CanonicalFinalCoverPreferenceFinalistDetail, CanonicalRemediationSimulationDetail } from '../types';
import {
  buildFinalCoverFinalistPlanFromSimulation,
  buildOrderedRemediationAttempts,
  compareFinalCoverPreferenceTieBreak,
  computeFinalCoverPreferenceScoreFromSignals,
  selectFinalCoverPreferenceWinner,
} from '../final-cover-preference.service';
import type { ScoredImageCandidate } from '../types';

const baseHero = {
  subjectAreaRatio: 0.55,
  subjectWidthRatio: 0.72,
  subjectHeightRatio: 0.68,
  extentBalance: 0.82,
};

function makeSimRow(
  overrides: Partial<CanonicalRemediationSimulationDetail>
): CanonicalRemediationSimulationDetail {
  const q = {
    deadSpaceRatio: 0.2,
    centerSignalRatio: 0.5,
    globalLuminanceStdev: 40,
    edgeTextureStdev: 30,
    washoutIndex: 0.25,
    silhouetteStrength: 60,
    readabilityEstimate: 70,
  };
  return {
    candidateUrl: 'https://example.com/a.jpg',
    objectKey: 'a',
    recipeId: 'square_white_catalog_jpeg',
    fidelityTier: 'low',
    simPolicyPass: true,
    simConversionPass: true,
    simBothPass: true,
    simHeroPass: true,
    simIntegrityPass: true,
    simScoreBase: 1,
    simScore: 100,
    simAllCorePass: true,
    simulationQuality: q,
    calibratedReasons: [],
    heroMetrics: {
      subjectAreaRatio: 0.8,
      subjectWidthRatio: 0.9,
      subjectHeightRatio: 0.85,
      extentBalance: 0.9,
      trimThreshold: 14,
    },
    integrityMetrics: {
      meanLuminance: 230,
      luminanceStdev: 40,
      signalPixelRatio: 0.5,
      nearWhitePixelRatio: 0.4,
      luminanceRange: 200,
      sampleWidth: 256,
      sampleHeight: 256,
    },
    policyFailures: [],
    conversionFailures: [],
    heroFailures: [],
    integrityFailures: [],
    ...overrides,
  };
}

function makeFinalist(
  overrides: Partial<CanonicalFinalCoverPreferenceFinalistDetail>
): CanonicalFinalCoverPreferenceFinalistDetail {
  return {
    candidateUrl: 'https://x.com/1.jpg',
    objectKey: 'k1',
    recipeId: 'square_white_catalog_jpeg',
    preferenceScore: 100,
    finalCoverQuality: {
      deadSpaceRatio: 0.1,
      centerSignalRatio: 0.6,
      globalLuminanceStdev: 40,
      edgeTextureStdev: 30,
      washoutIndex: 0.2,
      silhouetteStrength: 65,
      readabilityEstimate: 75,
    },
    preferenceReasons: [],
    heroMetrics: {
      subjectAreaRatio: 0.7,
      subjectWidthRatio: 0.75,
      subjectHeightRatio: 0.74,
      extentBalance: 0.85,
      trimThreshold: 14,
    },
    ...overrides,
  };
}

describe('final-cover-preference.service', () => {
  it('computeFinalCoverPreferenceScoreFromSignals ranks stronger commercial signals higher', () => {
    const weakQ = {
      deadSpaceRatio: 0.45,
      centerSignalRatio: 0.22,
      globalLuminanceStdev: 20,
      edgeTextureStdev: 25,
      washoutIndex: 0.55,
      silhouetteStrength: 40,
      readabilityEstimate: 42,
    };
    const strongQ = {
      deadSpaceRatio: 0.12,
      centerSignalRatio: 0.62,
      globalLuminanceStdev: 45,
      edgeTextureStdev: 28,
      washoutIndex: 0.18,
      silhouetteStrength: 72,
      readabilityEstimate: 82,
    };
    const weak = computeFinalCoverPreferenceScoreFromSignals({ hero: baseHero, q: weakQ });
    const strong = computeFinalCoverPreferenceScoreFromSignals({ hero: baseHero, q: strongQ });
    expect(strong.preferenceScore).toBeGreaterThan(weak.preferenceScore);
  });

  it('selectFinalCoverPreferenceWinner picks higher score and documents beat delta', () => {
    const a = makeFinalist({
      candidateUrl: 'https://a',
      recipeId: 'square_white_catalog_jpeg',
      preferenceScore: 120_000,
      preferenceReasons: ['final_readability_80.0'],
    });
    const b = makeFinalist({
      candidateUrl: 'https://b',
      objectKey: 'kb',
      recipeId: 'inset_white_catalog_png',
      preferenceScore: 95_000,
    });
    const { winner, beatReasons } = selectFinalCoverPreferenceWinner([a, b]);
    expect(winner.candidateUrl).toBe('https://a');
    expect(winner.preferenceScore).toBe(120_000);
    expect(beatReasons.some((x) => x.includes('compared_2'))).toBe(true);
    expect(beatReasons.some((x) => x.includes('beat_kb_') && x.includes('inset_white_catalog_png'))).toBe(true);
  });

  it('compareFinalCoverPreferenceTieBreak is deterministic on equal scores', () => {
    const squareRecipe = makeFinalist({
      preferenceScore: 50,
      recipeId: 'square_white_catalog_jpeg',
      heroMetrics: {
        subjectAreaRatio: 0.6,
        subjectWidthRatio: 0.7,
        subjectHeightRatio: 0.65,
        extentBalance: 0.8,
        trimThreshold: 14,
      },
    });
    const insetRecipe = makeFinalist({
      preferenceScore: 50,
      recipeId: 'inset_white_catalog_png',
      heroMetrics: {
        subjectAreaRatio: 0.6,
        subjectWidthRatio: 0.7,
        subjectHeightRatio: 0.65,
        extentBalance: 0.8,
        trimThreshold: 14,
      },
    });
    expect(compareFinalCoverPreferenceTieBreak(insetRecipe, squareRecipe)).toBeLessThan(0);
    expect(compareFinalCoverPreferenceTieBreak(squareRecipe, insetRecipe)).toBeGreaterThan(0);
  });

  it('buildFinalCoverFinalistPlanFromSimulation dedupes by url+recipe and keeps max simScore', () => {
    const rows = [
      makeSimRow({ simScore: 100, fidelityTier: 'low' }),
      makeSimRow({ simScore: 200, fidelityTier: 'high' }),
      makeSimRow({
        candidateUrl: 'https://example.com/b.jpg',
        objectKey: 'b',
        recipeId: 'inset_white_catalog_png',
        simScore: 300,
      }),
    ];
    const plan = buildFinalCoverFinalistPlanFromSimulation({
      rows,
      maxPlanSlots: 3,
      recipeChain: ['square_white_catalog_jpeg', 'inset_white_catalog_png'],
      insetOverridePresent: true,
    });
    expect(plan).toHaveLength(2);
    expect(plan.find((p) => p.candidateUrl.endsWith('/a.jpg'))?.simScore).toBe(200);
    expect(plan[0]?.simScore).toBe(300);
  });

  it('buildOrderedRemediationAttempts places simulation plan before remaining pairs', () => {
    const sA = {
      url: 'https://a',
      objectKey: 'a',
      policyFitness: 80,
      conversionFitness: 60,
      combinedScore: 100,
      remediationFitnessReasons: [],
    } as ScoredImageCandidate;
    const sB = {
      url: 'https://b',
      objectKey: 'b',
      policyFitness: 70,
      conversionFitness: 55,
      combinedScore: 90,
      remediationFitnessReasons: [],
    } as ScoredImageCandidate;
    const order = [sB, sA];
    const attempts = buildOrderedRemediationAttempts({
      remediationOrder: order,
      recipeChain: ['square_white_catalog_jpeg', 'inset_white_catalog_png'],
      insetOverridePresent: true,
      plan: [
        { candidateUrl: 'https://a', recipeId: 'inset_white_catalog_png' },
        { candidateUrl: 'https://b', recipeId: 'square_white_catalog_jpeg' },
      ],
    });
    expect(attempts[0]).toEqual({ candidate: sA, recipeId: 'inset_white_catalog_png' });
    expect(attempts[1]).toEqual({ candidate: sB, recipeId: 'square_white_catalog_jpeg' });
    expect(attempts[2]).toEqual({ candidate: sB, recipeId: 'inset_white_catalog_png' });
    expect(attempts[3]).toEqual({ candidate: sA, recipeId: 'square_white_catalog_jpeg' });
  });
});
