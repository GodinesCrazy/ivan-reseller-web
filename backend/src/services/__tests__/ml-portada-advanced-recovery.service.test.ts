import sharp from 'sharp';
import {
  applyPortadaRecoveryProfileToCutout,
  DEFAULT_P108_RECOVERY_PROFILE_ORDER,
  resolveRecoveryProfileOrder,
  type PortadaRecoveryProfileId,
} from '../ml-portada-advanced-recovery.service';

describe('ml-portada-advanced-recovery.service (P108)', () => {
  async function rgbaCutout(): Promise<Buffer> {
    const inner = await sharp({
      create: { width: 120, height: 120, channels: 3, background: '#888888' },
    })
      .png()
      .toBuffer();
    return sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: inner, gravity: 'centre' }])
      .png()
      .toBuffer();
  }

  it('resolveRecoveryProfileOrder false yields only none', () => {
    expect(resolveRecoveryProfileOrder(false)).toEqual(['p108_none']);
  });

  it('resolveRecoveryProfileOrder true matches default order', () => {
    expect(resolveRecoveryProfileOrder(true)).toEqual(DEFAULT_P108_RECOVERY_PROFILE_ORDER);
  });

  it('p108_none returns same buffer reference', async () => {
    const c = await rgbaCutout();
    const out = await applyPortadaRecoveryProfileToCutout(c, 'p108_none');
    expect(out).toBe(c);
  });

  it.each([
    'p108_feather_alpha_light',
    'p108_feather_alpha_medium',
    'p108_alpha_erode1_feather',
    'p108_alpha_dilate1_feather',
  ] as PortadaRecoveryProfileId[])('profile %s produces valid PNG', async (profile) => {
    const c = await rgbaCutout();
    const out = await applyPortadaRecoveryProfileToCutout(c, profile);
    expect(out).not.toBeNull();
    expect(out).not.toBe(c);
    const meta = await sharp(out!).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
  });
});
