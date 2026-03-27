import sharp from 'sharp';
import { evaluateHeroCoverQualityOnBuffer } from '../hero-cover-quality-gate.service';
import { ML_CHILE_POLICY_PROFILE_V1 } from '../policy-profiles';

describe('hero-cover-quality-gate.service', () => {
  const profile = ML_CHILE_POLICY_PROFILE_V1;

  it('passes a square canvas with a large centered subject', async () => {
    const W = 800;
    const H = 800;
    const side = 520;
    const off = (W - side) / 2;
    const buf = await sharp({
      create: { width: W, height: H, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: side, height: side, channels: 3, background: '#2a2a2a' },
          }).png().toBuffer(),
          left: Math.floor(off),
          top: Math.floor(off),
        },
      ])
      .png()
      .toBuffer();

    const r = await evaluateHeroCoverQualityOnBuffer(buf, profile);
    expect(r.pass).toBe(true);
    expect(r.hero.failures).toHaveLength(0);
    expect(r.metrics.subjectAreaRatio).toBeGreaterThan(profile.heroCoverGate.minSubjectAreaRatio - 0.02);
  });

  it('fails postage-stamp / small-subject composition (inset-weakness class)', async () => {
    const W = 1536;
    const H = 1536;
    const buf = await sharp({
      create: { width: W, height: H, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 420, height: 220, channels: 3, background: '#444444' },
          }).png().toBuffer(),
          left: 558,
          top: 658,
        },
      ])
      .png()
      .toBuffer();

    const r = await evaluateHeroCoverQualityOnBuffer(buf, profile);
    expect(r.pass).toBe(false);
    expect(r.hero.failures.length).toBeGreaterThan(0);
  });

  it('fails thin-strip composition (narrow subject)', async () => {
    const W = 800;
    const H = 800;
    const buf = await sharp({
      create: { width: W, height: H, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 40, height: 720, channels: 3, background: '#333333' },
          }).png().toBuffer(),
          left: 380,
          top: 40,
        },
      ])
      .png()
      .toBuffer();

    const r = await evaluateHeroCoverQualityOnBuffer(buf, profile);
    expect(r.pass).toBe(false);
    expect(
      r.hero.failures.some(
        (f) => f.includes('thin_or_strip') || f.includes('width_ratio') || f.includes('area_ratio')
      )
    ).toBe(true);
  });
});
