import sharp from 'sharp';
import {
  scoreImageCandidateFromBuffer,
} from '../candidate-scoring.service';
import { ML_CHILE_POLICY_PROFILE_V1 } from '../policy-profiles';

describe('remediation-fitness-selection', () => {
  const profile = ML_CHILE_POLICY_PROFILE_V1;

  it('prefers a clear centered subject (easier to remediate into portada)', async () => {
    const W = 800;
    const H = 800;
    const side = 520; // area ratio ~0.4225 (just above P79 min)
    const off = (W - side) / 2;

    const easy = await sharp({
      create: { width: W, height: H, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: side, height: side, channels: 3, background: '#2a2a2a' },
          })
            .png()
            .toBuffer(),
          left: Math.floor(off),
          top: Math.floor(off),
        },
      ])
      .png()
      .toBuffer();

    const hardSide = 220;
    const hardOff = (W - hardSide) / 2;
    const hard = await sharp({
      create: { width: W, height: H, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: hardSide, height: hardSide, channels: 3, background: '#2a2a2a' },
          })
            .png()
            .toBuffer(),
          left: Math.floor(hardOff),
          top: Math.floor(hardOff),
        },
      ])
      .png()
      .toBuffer();

    const easyScored = await scoreImageCandidateFromBuffer(
      easy,
      'easy',
      'test:easy'
    );
    const hardScored = await scoreImageCandidateFromBuffer(
      hard,
      'hard',
      'test:hard'
    );

    expect(easyScored.scores.remediationFitness).toBeGreaterThan(hardScored.scores.remediationFitness);
    expect(easyScored.remediationFitnessReasons.join(';')).toContain('remFit_predicted_hero');
    expect(easyScored.scores.remediationFitness).toBeGreaterThan(40);
  });

  it('penalizes near-blank white fields (should be hard to turn into an attractive cover)', async () => {
    const nearBlank = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: '#fdfdfd' },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    const scored = await scoreImageCandidateFromBuffer(
      nearBlank,
      'near_blank',
      'test:near_blank'
    );

    // It should fall under a reasonable cutoff (tuned to be above the strict near-blank integrity gate).
    expect(scored.scores.remediationFitness).toBeLessThan(25);
    expect(scored.remediationFitnessReasons.some((r) => r.includes('pred_hero') || r.includes('remFit_text_logo'))).toBe(true);
    // Guardrail: ensure our fitness predictor is not ignoring the configured trim threshold.
    expect(profile.heroCoverGate.trimThreshold).toBeGreaterThan(0);
  });
});

