import sharp from 'sharp';
import {
  isolateProductSubjectToPngWithVariant,
  type PortadaSegmentationVariantId,
} from '../ml-portada-isolation.service';

describe('ml-portada-isolation.service (P109 variants)', () => {
  async function supplierLike(): Promise<Buffer> {
    const gray = await sharp({
      create: { width: 200, height: 200, channels: 3, background: '#999999' },
    })
      .png()
      .toBuffer();
    return sharp({
      create: { width: 500, height: 500, channels: 3, background: '#e8e8e8' },
    })
      .composite([{ input: gray, gravity: 'centre' }])
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  it.each(['p103_v1_default', 'p109_border_relaxed', 'p109_mask_minimal_spread', 'p109_soft_alpha_blur'] as const)(
    'variant %s returns PNG when segmentation succeeds',
    async (variant: PortadaSegmentationVariantId) => {
      const buf = await supplierLike();
      const r = await isolateProductSubjectToPngWithVariant(buf, variant);
      expect(r).not.toBeNull();
      const meta = await sharp(r!.png).metadata();
      expect(meta.width).toBe(500);
      expect(meta.height).toBe(500);
    }
  );
});
