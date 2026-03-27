/**
 * P103/P109 — Border-statistics product isolation + P109 segmentation variants for autonomous portada recovery.
 */
import sharp from 'sharp';

export const MASK_MAX = 720;

export type PortadaSegmentationVariantId =
  | 'p103_v1_default'
  | 'p109_border_relaxed'
  | 'p109_mask_minimal_spread'
  | 'p109_soft_alpha_blur';

type VariantParams = {
  /** Fraction of min(w,h) for border sampling band. */
  borderBandMinRatio: number;
  threshMultiplier: number;
  /** Extra binary erode on rawFg before standard morph chain (0 or 1). */
  preMorphExtraErode: number;
  /** Dilations on largest CC before alpha (0 = none, 1 = current default). */
  postCcDilatePasses: number;
  alphaBlurSigma: number;
};

const VARIANT_PARAMS: Record<PortadaSegmentationVariantId, VariantParams> = {
  p103_v1_default: {
    borderBandMinRatio: 0.02,
    threshMultiplier: 3.05,
    preMorphExtraErode: 0,
    postCcDilatePasses: 1,
    alphaBlurSigma: 1.05,
  },
  p109_border_relaxed: {
    borderBandMinRatio: 0.042,
    threshMultiplier: 2.68,
    preMorphExtraErode: 0,
    postCcDilatePasses: 1,
    alphaBlurSigma: 1.15,
  },
  p109_mask_minimal_spread: {
    borderBandMinRatio: 0.02,
    threshMultiplier: 3.05,
    preMorphExtraErode: 0,
    postCcDilatePasses: 0,
    alphaBlurSigma: 1.05,
  },
  p109_soft_alpha_blur: {
    borderBandMinRatio: 0.02,
    threshMultiplier: 3.05,
    preMorphExtraErode: 0,
    postCcDilatePasses: 1,
    alphaBlurSigma: 1.55,
  },
};

export const DEFAULT_P109_SEGMENTATION_ORDER: PortadaSegmentationVariantId[] = [
  'p103_v1_default',
  'p109_border_relaxed',
  'p109_mask_minimal_spread',
  'p109_soft_alpha_blur',
];

export function isP109V2SegmentationGloballyEnabled(): boolean {
  const v = process.env.ML_P109_V2;
  return v !== '0' && v !== 'false';
}

export function resolveSegmentationVariantOrder(p109Enabled: boolean): PortadaSegmentationVariantId[] {
  if (!p109Enabled) {
    return ['p103_v1_default'];
  }
  return [...DEFAULT_P109_SEGMENTATION_ORDER];
}

function binaryErode1(mask: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let v = 1;
      for (let dy = -1; dy <= 1 && v; dy++) {
        for (let dx = -1; dx <= 1 && v; dx++) {
          if (mask[(y + dy) * w + x + dx] === 0) v = 0;
        }
      }
      o[y * w + x] = v;
    }
  }
  return o;
}

function binaryDilate1(mask: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let v = 0;
      for (let dy = -1; dy <= 1 && !v; dy++) {
        for (let dx = -1; dx <= 1 && !v; dx++) {
          if (mask[(y + dy) * w + x + dx] === 1) v = 1;
        }
      }
      o[y * w + x] = v;
    }
  }
  return o;
}

function largestCcMask(mask: Uint8Array, w: number, h: number): Uint8Array | null {
  const visited = new Uint8Array(w * h);
  let bestMask = new Uint8Array(w * h);
  let best = 0;

  for (let idx = 0; idx < w * h; idx++) {
    if (!mask[idx] || visited[idx]) continue;
    const comp = new Uint8Array(w * h);
    const q: number[] = [idx];
    visited[idx] = 1;
    comp[idx] = 1;
    let qi = 0;
    while (qi < q.length) {
      const cur = q[qi++]!;
      const x = cur % w;
      const y = Math.floor(cur / w);
      if (x > 0) {
        const n = cur - 1;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          comp[n] = 1;
          q.push(n);
        }
      }
      if (x < w - 1) {
        const n = cur + 1;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          comp[n] = 1;
          q.push(n);
        }
      }
      if (y > 0) {
        const n = cur - w;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          comp[n] = 1;
          q.push(n);
        }
      }
      if (y < h - 1) {
        const n = cur + w;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          comp[n] = 1;
          q.push(n);
        }
      }
    }
    if (q.length > best) {
      best = q.length;
      bestMask = comp;
    }
  }

  const ratio = best / (w * h);
  if (ratio < 0.026 || ratio > 0.94) return null;
  return bestMask;
}

/**
 * Isolates subject using border RGB statistics; variant tunes band/threshold/morph/alpha blur (P109).
 */
export async function isolateProductSubjectToPngWithVariant(
  input: Buffer,
  variant: PortadaSegmentationVariantId
): Promise<{ png: Buffer } | null> {
  const p = VARIANT_PARAMS[variant];
  const base = sharp(input).rotate();
  const meta = await base.metadata();
  const W0 = meta.width ?? 0;
  const H0 = meta.height ?? 0;
  if (W0 < 80 || H0 < 80) return null;

  const { data, info } = await base
    .clone()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(MASK_MAX, MASK_MAX, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const wm = info.width;
  const hm = info.height;
  const stride = info.channels;
  if (stride < 3) return null;

  const samples: number[] = [];
  const band = Math.max(2, Math.floor(Math.min(wm, hm) * p.borderBandMinRatio));
  for (let y = 0; y < hm; y++) {
    for (let x = 0; x < wm; x++) {
      if (x >= band && x < wm - band && y >= band && y < hm - band) continue;
      const i = (y * wm + x) * stride;
      samples.push(data[i]!, data[i + 1]!, data[i + 2]!);
    }
  }

  const ns = Math.max(1, samples.length / 3);
  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (let i = 0; i < samples.length; i += 3) {
    mr += samples[i]!;
    mg += samples[i + 1]!;
    mb += samples[i + 2]!;
  }
  mr /= ns;
  mg /= ns;
  mb /= ns;
  let vr = 0;
  let vg = 0;
  let vb = 0;
  for (let i = 0; i < samples.length; i += 3) {
    vr += (samples[i]! - mr) ** 2;
    vg += (samples[i + 1]! - mg) ** 2;
    vb += (samples[i + 2]! - mb) ** 2;
  }
  vr /= ns;
  vg /= ns;
  vb /= ns;
  const varRgb = (vr + vg + vb) / 3;
  const thresh = Math.max(13, Math.min(54, p.threshMultiplier * Math.sqrt(varRgb + 8)));

  const rawFg = new Uint8Array(wm * hm);
  for (let y = 0; y < hm; y++) {
    for (let x = 0; x < wm; x++) {
      const i = (y * wm + x) * stride;
      const d = Math.hypot(data[i]! - mr, data[i + 1]! - mg, data[i + 2]! - mb);
      rawFg[y * wm + x] = d > thresh ? 1 : 0;
    }
  }

  let fg: Uint8Array = rawFg;
  if (p.preMorphExtraErode > 0) {
    fg = binaryErode1(fg, wm, hm);
  }
  fg = binaryErode1(fg, wm, hm);
  fg = binaryDilate1(fg, wm, hm);
  fg = binaryDilate1(fg, wm, hm);
  const cc = largestCcMask(fg, wm, hm);
  if (!cc) {
    return null;
  }
  fg = cc as Uint8Array;
  for (let d = 0; d < p.postCcDilatePasses; d++) {
    fg = binaryDilate1(fg, wm, hm);
  }

  const grey = Buffer.alloc(wm * hm);
  for (let i = 0; i < wm * hm; i++) {
    grey[i] = fg[i] ? 255 : 0;
  }

  let alphaFull: Buffer;
  try {
    alphaFull = await sharp(grey, { raw: { width: wm, height: hm, channels: 1 } })
      .blur(p.alphaBlurSigma)
      .resize(W0, H0, { kernel: sharp.kernel.cubic })
      .raw()
      .toBuffer();
  } catch {
    return null;
  }

  const rgbaOrig = await base.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (rgbaOrig.info.width !== W0 || rgbaOrig.info.height !== H0) {
    return null;
  }
  const ch = rgbaOrig.info.channels;
  if (ch < 3) return null;

  const out = Buffer.alloc(W0 * H0 * 4);
  const src = rgbaOrig.data;
  for (let i = 0; i < W0 * H0; i++) {
    const o = i * ch;
    out[i * 4] = src[o]!;
    out[i * 4 + 1] = src[o + 1]!;
    out[i * 4 + 2] = src[o + 2]!;
    out[i * 4 + 3] = alphaFull[i] ?? 0;
  }

  try {
    const png = await sharp(out, { raw: { width: W0, height: H0, channels: 4 } }).png({ compressionLevel: 7 }).toBuffer();
    return { png };
  } catch {
    return null;
  }
}

export async function isolateProductSubjectToPng(input: Buffer): Promise<{ png: Buffer } | null> {
  return isolateProductSubjectToPngWithVariant(input, 'p103_v1_default');
}
