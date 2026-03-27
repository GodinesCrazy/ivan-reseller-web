import { computeCalibratedSimScore } from '../simulation-quality-metrics.service';

describe('simulation-quality-metrics.service', () => {
  it('penalizes washy all-pass previews via suspicious-pass rule', () => {
    const qLowCenter = {
      deadSpaceRatio: 0.2,
      centerSignalRatio: 0.08,
      globalLuminanceStdev: 12,
      edgeTextureStdev: 25,
      washoutIndex: 0.72,
      silhouetteStrength: 4,
      readabilityEstimate: 40,
    };
    const qHealthy = {
      deadSpaceRatio: 0.2,
      centerSignalRatio: 0.35,
      globalLuminanceStdev: 22,
      edgeTextureStdev: 28,
      washoutIndex: 0.25,
      silhouetteStrength: 18,
      readabilityEstimate: 72,
    };

    const baseParams = {
      simBothPass: true,
      heroPass: true,
      integrityPass: true,
      subjectAreaRatio: 0.55,
      extentBalance: 0.9,
      subjectWidthRatio: 0.7,
      subjectHeightRatio: 0.75,
      signalPixelRatio: 0.4,
      luminanceRange: 200,
      nearWhitePixelRatio: 0.5,
    };

    const weak = computeCalibratedSimScore({ ...baseParams, q: qLowCenter });
    const strong = computeCalibratedSimScore({ ...baseParams, q: qHealthy });

    expect(strong.simScore).toBeGreaterThan(weak.simScore);
    expect(weak.calibratedReasons.some((r) => r.includes('suspicious_pass'))).toBe(true);
  });
});
