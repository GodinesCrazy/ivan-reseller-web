import sharp from 'sharp';
import { evaluateOutputIntegrityOnBuffer } from '../output-integrity-gate.service';
import { ML_CHILE_POLICY_PROFILE_V1 } from '../policy-profiles';

describe('output-integrity-gate.service', () => {
  const profile = ML_CHILE_POLICY_PROFILE_V1;

  it('fails a fully blank white canvas', async () => {
    const buf = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: '#ffffff' },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    const r = await evaluateOutputIntegrityOnBuffer(buf, profile);
    expect(r.pass).toBe(false);
    expect(r.integrity.failures.length).toBeGreaterThan(0);
    expect(r.integrity.failures.some((f) => f.includes('signal_pixel_ratio'))).toBe(true);
  });

  it('fails near-uniform bright field (near-blank)', async () => {
    const buf = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: '#fefefe' },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    const r = await evaluateOutputIntegrityOnBuffer(buf, profile);
    expect(r.pass).toBe(false);
    expect(
      r.integrity.failures.some(
        (f) =>
          f.includes('near_white_pixel_ratio') ||
          f.includes('signal_pixel_ratio') ||
          f.includes('luminance_stdev') ||
          f.includes('luminance_range')
      )
    ).toBe(true);
  });

  it('fails weak global contrast (only near-white nuance, no visible subject)', async () => {
    const top = await sharp({
      create: { width: 800, height: 400, channels: 3, background: '#fcfcfc' },
    })
      .png()
      .toBuffer();
    const bot = await sharp({
      create: { width: 800, height: 400, channels: 3, background: '#fefefe' },
    })
      .png()
      .toBuffer();
    const buf = await sharp({
      create: { width: 800, height: 800, channels: 3, background: '#fcfcfc' },
    })
      .composite([
        { input: top, left: 0, top: 0 },
        { input: bot, left: 0, top: 400 },
      ])
      .png()
      .toBuffer();

    const r = await evaluateOutputIntegrityOnBuffer(buf, profile);
    expect(r.pass).toBe(false);
    expect(
      r.integrity.failures.some(
        (f) => f.includes('luminance_range') || f.includes('signal_pixel_ratio') || f.includes('near_white')
      )
    ).toBe(true);
  });

  it('passes a strong catalog-style hero (dark subject on white)', async () => {
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
          })
            .png()
            .toBuffer(),
          left: Math.floor(off),
          top: Math.floor(off),
        },
      ])
      .png()
      .toBuffer();

    const r = await evaluateOutputIntegrityOnBuffer(buf, profile);
    expect(r.pass).toBe(true);
    expect(r.integrity.failures).toHaveLength(0);
    expect(r.metrics.signalPixelRatio).toBeGreaterThan(profile.outputIntegrityGate.minSignalPixelRatio);
  });

  it('fails suspected trim full-canvas when hero metrics say full subject but pixels are empty', async () => {
    const buf = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: '#fdfdfd' },
    })
      .jpeg({ quality: 96 })
      .toBuffer();

    const r = await evaluateOutputIntegrityOnBuffer(buf, profile, {
      heroMetrics: {
        canvasWidth: 1000,
        canvasHeight: 1000,
        trimWidth: 1000,
        trimHeight: 1000,
        subjectWidthRatio: 1,
        subjectHeightRatio: 1,
        subjectAreaRatio: 1,
        extentBalance: 1,
        trimThreshold: profile.heroCoverGate.trimThreshold,
      },
    });
    expect(r.pass).toBe(false);
    expect(
      r.integrity.failures.some((f) => f.includes('trim_full_canvas') || f.includes('signal_pixel_ratio'))
    ).toBe(true);
  });
});
