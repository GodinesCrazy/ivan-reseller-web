/**
 * P108 — Advanced automatic cutout recovery before portada compose (supplier-only path).
 * Alpha-domain feather / morphology to reduce sticker-edge and halo artifacts without manual heroes.
 */
import sharp from 'sharp';

export type PortadaRecoveryProfileId =
  | 'p108_none'
  | 'p108_feather_alpha_light'
  | 'p108_feather_alpha_medium'
  | 'p108_alpha_erode1_feather'
  | 'p108_alpha_dilate1_feather';

/** Default wave order: raw cutout first, then progressively stronger edge treatment. */
export const DEFAULT_P108_RECOVERY_PROFILE_ORDER: PortadaRecoveryProfileId[] = [
  'p108_none',
  'p108_feather_alpha_light',
  'p108_feather_alpha_medium',
  'p108_alpha_erode1_feather',
  'p108_alpha_dilate1_feather',
];

function clampU8(x: number): number {
  return Math.max(0, Math.min(255, Math.round(x)));
}

function boxBlurAlphaOnce(alpha: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += alpha[yy * w + xx]!;
          c++;
        }
      }
      o[y * w + x] = clampU8(s / c);
    }
  }
  return o;
}

function boxBlurAlpha(alpha: Uint8Array, w: number, h: number, passes: number): Uint8Array {
  let cur = alpha;
  for (let i = 0; i < passes; i++) {
    cur = boxBlurAlphaOnce(cur, w, h);
  }
  return cur;
}

function erodeAlpha3(alpha: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) {
          m = 0;
          break;
        }
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) {
            m = 0;
            break;
          }
          m = Math.min(m, alpha[yy * w + xx]!);
        }
      }
      o[y * w + x] = m;
    }
  }
  return o;
}

function dilateAlpha3(alpha: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          m = Math.max(m, alpha[yy * w + xx]!);
        }
      }
      o[y * w + x] = m;
    }
  }
  return o;
}

/**
 * Apply P108 recovery on an isolated RGBA cutout (P103 output). `p108_none` returns the same buffer reference.
 */
export async function applyPortadaRecoveryProfileToCutout(
  cutoutPng: Buffer,
  profile: PortadaRecoveryProfileId
): Promise<Buffer | null> {
  if (profile === 'p108_none') {
    return cutoutPng;
  }

  let rgba: Buffer;
  let w: number;
  let h: number;
  try {
    const { data, info } = await sharp(cutoutPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    w = info.width;
    h = info.height;
    if (info.channels !== 4 || w < 2 || h < 2) return null;
    rgba = Buffer.from(data);
  } catch {
    return null;
  }

  const n = w * h;
  const alphaIn = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    alphaIn[i] = rgba[i * 4 + 3]!;
  }

  let alphaOut: Uint8Array;
  switch (profile) {
    case 'p108_feather_alpha_light':
      alphaOut = boxBlurAlpha(alphaIn, w, h, 2);
      break;
    case 'p108_feather_alpha_medium':
      alphaOut = boxBlurAlpha(alphaIn, w, h, 5);
      break;
    case 'p108_alpha_erode1_feather':
      alphaOut = boxBlurAlpha(erodeAlpha3(alphaIn, w, h), w, h, 2);
      break;
    case 'p108_alpha_dilate1_feather':
      alphaOut = boxBlurAlpha(dilateAlpha3(alphaIn, w, h), w, h, 2);
      break;
    default:
      return null;
  }

  for (let i = 0; i < n; i++) {
    rgba[i * 4 + 3] = alphaOut[i]!;
  }

  try {
    return await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .png({ compressionLevel: 7 })
      .toBuffer();
  } catch {
    return null;
  }
}

export function isAdvancedPortadaRecoveryGloballyEnabled(): boolean {
  const v = process.env.ML_P108_ADVANCED_RECOVERY;
  return v !== '0' && v !== 'false';
}

/** Profiles used when advanced recovery is on (includes none as first wave). */
export function resolveRecoveryProfileOrder(advancedRecovery: boolean): PortadaRecoveryProfileId[] {
  if (!advancedRecovery) {
    return ['p108_none'];
  }
  return [...DEFAULT_P108_RECOVERY_PROFILE_ORDER];
}
