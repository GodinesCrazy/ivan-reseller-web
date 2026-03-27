import type { P103HeroAttemptResult } from '../ml-portada-hero-reconstruction.service';
import {
  buildPortadaAutomationReadinessFromP103,
  stripPortadaSupplementHeroFieldsForAutomaticBenchmark,
} from '../ml-image-readiness.service';

describe('ml-image-readiness.service (P107)', () => {
  it('strips supplement hero fields for automatic benchmark', () => {
    const raw = {
      mlImagePipeline: {
        portadaSupplementHeroUrl: 'https://x/y.jpg',
        portadaSupplementHeroWorkspaceRelativePath: 'a/b.png',
        canonicalSupplementUrls: ['https://clean.example/z.png'],
      },
    };
    const out = stripPortadaSupplementHeroFieldsForAutomaticBenchmark(raw);
    const pipe = out.mlImagePipeline as Record<string, unknown>;
    expect(pipe.portadaSupplementHeroUrl).toBeUndefined();
    expect(pipe.portadaSupplementHeroWorkspaceRelativePath).toBeUndefined();
    expect(pipe.canonicalSupplementUrls).toEqual(['https://clean.example/z.png']);
  });

  it('buildPortadaAutomationReadinessFromP103 returns null for null attempt', () => {
    expect(buildPortadaAutomationReadinessFromP103(null)).toBeNull();
  });

  it('buildPortadaAutomationReadinessFromP103 maps failed attempt', () => {
    const r = buildPortadaAutomationReadinessFromP103({
      ok: false,
      trace: {
        rankedSources: [],
        trials: [
          {
            url: 'https://ae.test/1.jpg',
            objectKey: 'k',
            rank: 1,
            isolationOk: true,
            recipeTrials: [
              {
                recipeId: 'p107_white_078',
                recoveryProfileId: 'p108_none',
                strictNaturalPass: false,
                strictNaturalSignals: ['signal_a'],
              },
            ],
          },
        ],
        automaticPortadaClassification: 'AUTONOMOUS_V2_RECOVERY_EXHAUSTED',
        supplementHeroConfigured: false,
        advancedRecoveryEnabled: true,
        recoveryProfilesAttempted: ['p108_none', 'p108_feather_alpha_light'],
        segmentationVariantsAttempted: ['p103_v1_default', 'p109_border_relaxed'],
        studioPrepIdsAttempted: ['p109_none', 'p109_halo_light'],
        recoveryEngineVersion: 'p109_autonomous_v2',
      },
    } as P103HeroAttemptResult);
    expect(r?.publishAllowedPortada).toBe(false);
    expect(r?.classification).toBe('AUTONOMOUS_V2_RECOVERY_EXHAUSTED');
    expect(r?.sourceTrialCount).toBe(1);
    expect(r?.recipeVariantsTriedOnLastSource).toBe(1);
    expect(r?.advancedRecoveryEnabled).toBe(true);
    expect(r?.portadaAutomationRecipeFamily).toBe('p109_seg_x_studio_x_p108_x_p107');
    expect(r?.recoveryEngineVersion).toBe('p109_autonomous_v2');
    expect(r?.autonomousPipelineExhausted).toBe(true);
    expect(r?.autonomousImageReviewRecommended).toBe(true);
  });
});
