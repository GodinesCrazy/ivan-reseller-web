/**
 * P109 — RGB halo suppression / studio-prep on isolated cutouts (no generative API; local pixel ops).
 * Pulls semi-transparent fringe RGB toward white to reduce colored halos before hero compose.
 */
import sharp from 'sharp';

export type P109StudioPrepId = 'p109_none' | 'p109_halo_light' | 'p109_halo_medium';

export const DEFAULT_P109_STUDIO_PREP_ORDER: P109StudioPrepId[] = [
  'p109_none',
  'p109_halo_light',
  'p109_halo_medium',
];

export function resolveP109StudioPrepOrder(p109Enabled: boolean): P109StudioPrepId[] {
  if (!p109Enabled) {
    return ['p109_none'];
  }
  return [...DEFAULT_P109_STUDIO_PREP_ORDER];
}

function strengthForPrep(prep: P109StudioPrepId): number {
  if (prep === 'p109_halo_light') return 0.32;
  if (prep === 'p109_halo_medium') return 0.52;
  return 0;
}

/**
 * `p109_none` returns the same buffer reference.
 */
export async function applyP109StudioPrepToCutout(cutoutPng: Buffer, prep: P109StudioPrepId): Promise<Buffer | null> {
  if (prep === 'p109_none') {
    return cutoutPng;
  }
  const strength = strengthForPrep(prep);
  if (strength <= 0) return null;

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
  const aMin = 12;
  const aMax = 252;
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3]!;
    if (a <= aMin || a >= aMax) continue;
    const t = (strength * (255 - a)) / 255;
    if (t <= 0) continue;
    rgba[i * 4] = clampU8(rgba[i * 4]! + (255 - rgba[i * 4]!) * t);
    rgba[i * 4 + 1] = clampU8(rgba[i * 4 + 1]! + (255 - rgba[i * 4 + 1]!) * t);
    rgba[i * 4 + 2] = clampU8(rgba[i * 4 + 2]! + (255 - rgba[i * 4 + 2]!) * t);
  }

  try {
    return await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .png({ compressionLevel: 7 })
      .toBuffer();
  } catch {
    return null;
  }
}

function clampU8(x: number): number {
  return Math.max(0, Math.min(255, Math.round(x)));
}
