import sharp from 'sharp';
import { applyP109StudioPrepToCutout } from '../ml-portada-studio-prep-p109.service';

describe('ml-portada-studio-prep-p109.service', () => {
  it('p109_none returns same reference', async () => {
    const c = await sharp({
      create: { width: 32, height: 32, channels: 4, background: { r: 100, g: 100, b: 100, alpha: 0.5 } },
    })
      .png()
      .toBuffer();
    const out = await applyP109StudioPrepToCutout(c, 'p109_none');
    expect(out).toBe(c);
  });

  it('halo prep changes buffer and stays 32x32', async () => {
    const c = await sharp({
      create: { width: 32, height: 32, channels: 4, background: { r: 80, g: 80, b: 80, alpha: 0.4 } },
    })
      .png()
      .toBuffer();
    const out = await applyP109StudioPrepToCutout(c, 'p109_halo_light');
    expect(out).not.toBeNull();
    expect(out).not.toBe(c);
    const meta = await sharp(out!).metadata();
    expect(meta.width).toBe(32);
    expect(meta.height).toBe(32);
  });
});
