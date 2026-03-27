/**
 * P76 — Named remediation recipes with marketplace compatibility metadata.
 */
import sharp from 'sharp';
import type { MarketplaceImagePolicyProfile } from './types';

const MIN_SIDE = 1200;
const SIDE = 1536;
const INNER_MAX = 1320;

export interface RecipeDefinition {
  id: string;
  label: string;
  /** Profiles that may run this recipe without explicit override */
  compatibleProfileIds: string[];
  description: string;
}

export const REMEDIATION_RECIPES: Record<string, RecipeDefinition> = {
  square_white_catalog_jpeg: {
    id: 'square_white_catalog_jpeg',
    label: 'Square white canvas JPEG (min 1200)',
    compatibleProfileIds: ['mercadolibre_mlc_v1'],
    description: 'EXIF rotate, flatten white, contain in square min 1200, JPEG export',
  },
  inset_white_catalog_png: {
    id: 'inset_white_catalog_png',
    label: 'Inset crop + white 1536 PNG (optional SKU insets)',
    compatibleProfileIds: ['mercadolibre_mlc_v1'],
    description: 'Fractional inset extract, trim, resize inside, composite 1536 white, neutral crush',
  },
};

export function assertRecipeAllowed(recipeId: string, profile: MarketplaceImagePolicyProfile): void {
  const def = REMEDIATION_RECIPES[recipeId];
  if (!def) throw new Error(`unknown_remediation_recipe:${recipeId}`);
  if (!profile.compatibleRecipeIds.includes(recipeId)) {
    throw new Error(`recipe_${recipeId}_not_compatible_with_${profile.id}`);
  }
}

export async function applySquareWhiteCatalogJpeg(input: Buffer): Promise<Buffer> {
  const image = sharp(input).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const side = Math.max(MIN_SIDE, width, height);
  return image
    .flatten({ background: '#ffffff' })
    .resize(side, side, {
      fit: 'contain',
      background: '#ffffff',
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

export interface InsetCropFractions {
  left: number;
  top: number;
  bottom: number;
  right: number;
}

const DEFAULT_INSET: InsetCropFractions = {
  left: 0.38,
  top: 0.14,
  bottom: 0.26,
  right: 0.05,
};

function crushNeutralLightBackground(data: Buffer, channels: number): void {
  const chromaMax = 20;
  const lumMin = 178;
  const lumMax = 252;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const M = Math.max(r, g, b);
    const m = Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (M - m <= chromaMax && lum >= lumMin && lum <= lumMax) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      if (channels === 4) data[i + 3] = 255;
    }
  }
}

async function applyNeutralCrushOnRgbPng(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const copy = Buffer.from(data);
  crushNeutralLightBackground(copy, info.channels);
  return sharp(copy, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function applyInsetWhiteCatalogPng(
  input: Buffer,
  insets: InsetCropFractions = DEFAULT_INSET
): Promise<Buffer> {
  const meta = await sharp(input).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 64 || H < 64) throw new Error('source_too_small_for_inset');
  const li = Math.floor(W * insets.left);
  const ri = Math.floor(W * insets.right);
  const ti = Math.floor(H * insets.top);
  const bi = Math.floor(H * insets.bottom);
  const ew = W - li - ri;
  const eh = H - ti - bi;
  if (ew < 48 || eh < 48) throw new Error('inset_crop_too_aggressive');

  let insetBuf = await sharp(input)
    .rotate()
    .extract({ left: li, top: ti, width: ew, height: eh })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();

  try {
    insetBuf = await sharp(insetBuf).trim({ threshold: 18 }).png().toBuffer();
  } catch {
    /* keep */
  }

  const scaled = await sharp(insetBuf)
    .resize(INNER_MAX, INNER_MAX, {
      fit: 'inside',
      background: { r: 255, g: 255, b: 255 },
    })
    .modulate({ saturation: 0.88, brightness: 1.05 })
    .png()
    .toBuffer();

  const m2 = await sharp(scaled).metadata();
  const w2 = m2.width ?? INNER_MAX;
  const h2 = m2.height ?? INNER_MAX;
  const lx = Math.floor((SIDE - w2) / 2);
  const ty = Math.floor((SIDE - h2) / 2);

  const onWhite = await sharp({
    create: { width: SIDE, height: SIDE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: scaled, left: lx, top: ty }])
    .png()
    .toBuffer();

  return applyNeutralCrushOnRgbPng(onWhite);
}

export async function applyRecipe(
  recipeId: string,
  profile: MarketplaceImagePolicyProfile,
  sourceBuffer: Buffer,
  insetOverride?: InsetCropFractions | null
): Promise<Buffer> {
  assertRecipeAllowed(recipeId, profile);
  if (recipeId === 'square_white_catalog_jpeg') {
    return applySquareWhiteCatalogJpeg(sourceBuffer);
  }
  if (recipeId === 'inset_white_catalog_png') {
    return applyInsetWhiteCatalogPng(sourceBuffer, insetOverride ?? DEFAULT_INSET);
  }
  throw new Error(`recipe_not_implemented:${recipeId}`);
}

/** P82 — lower-cost preview square JPEG (smaller min side than production). */
const PREVIEW_SQUARE_MIN_SIDE = 960;

export async function applySquareWhiteCatalogJpegPreview(input: Buffer): Promise<Buffer> {
  const image = sharp(input).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const side = Math.max(PREVIEW_SQUARE_MIN_SIDE, width, height);
  return image
    .flatten({ background: '#ffffff' })
    .resize(side, side, {
      fit: 'contain',
      background: '#ffffff',
    })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

const PREVIEW_INSET_INNER_MAX = 880;
const PREVIEW_INSET_SIDE = 1152;

/** P82 — lower-cost preview inset PNG (scaled canvas vs production 1536). */
export async function applyInsetWhiteCatalogPngPreview(
  input: Buffer,
  insets: InsetCropFractions = DEFAULT_INSET
): Promise<Buffer> {
  const meta = await sharp(input).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 64 || H < 64) throw new Error('source_too_small_for_inset');
  const li = Math.floor(W * insets.left);
  const ri = Math.floor(W * insets.right);
  const ti = Math.floor(H * insets.top);
  const bi = Math.floor(H * insets.bottom);
  const ew = W - li - ri;
  const eh = H - ti - bi;
  if (ew < 48 || eh < 48) throw new Error('inset_crop_too_aggressive');

  let insetBuf = await sharp(input)
    .rotate()
    .extract({ left: li, top: ti, width: ew, height: eh })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();

  try {
    insetBuf = await sharp(insetBuf).trim({ threshold: 18 }).png().toBuffer();
  } catch {
    /* keep */
  }

  const scaled = await sharp(insetBuf)
    .resize(PREVIEW_INSET_INNER_MAX, PREVIEW_INSET_INNER_MAX, {
      fit: 'inside',
      background: { r: 255, g: 255, b: 255 },
    })
    .modulate({ saturation: 0.88, brightness: 1.05 })
    .png()
    .toBuffer();

  const m2 = await sharp(scaled).metadata();
  const w2 = m2.width ?? PREVIEW_INSET_INNER_MAX;
  const h2 = m2.height ?? PREVIEW_INSET_INNER_MAX;
  const lx = Math.floor((PREVIEW_INSET_SIDE - w2) / 2);
  const ty = Math.floor((PREVIEW_INSET_SIDE - h2) / 2);

  const onWhite = await sharp({
    create: { width: PREVIEW_INSET_SIDE, height: PREVIEW_INSET_SIDE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: scaled, left: lx, top: ty }])
    .png()
    .toBuffer();

  return applyNeutralCrushOnRgbPng(onWhite);
}

/** P83 — higher-fidelity preview (still not publish buffers). */
const PREVIEW_HI_SQUARE_MIN_SIDE = 1152;
const PREVIEW_HI_INSET_INNER_MAX = 1100;
const PREVIEW_HI_INSET_SIDE = 1408;

export async function applySquareWhiteCatalogJpegPreviewHigh(input: Buffer): Promise<Buffer> {
  const image = sharp(input).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const side = Math.max(PREVIEW_HI_SQUARE_MIN_SIDE, width, height);
  return image
    .flatten({ background: '#ffffff' })
    .resize(side, side, {
      fit: 'contain',
      background: '#ffffff',
    })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

export async function applyInsetWhiteCatalogPngPreviewHigh(
  input: Buffer,
  insets: InsetCropFractions = DEFAULT_INSET
): Promise<Buffer> {
  const meta = await sharp(input).rotate().metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 64 || H < 64) throw new Error('source_too_small_for_inset');
  const li = Math.floor(W * insets.left);
  const ri = Math.floor(W * insets.right);
  const ti = Math.floor(H * insets.top);
  const bi = Math.floor(H * insets.bottom);
  const ew = W - li - ri;
  const eh = H - ti - bi;
  if (ew < 48 || eh < 48) throw new Error('inset_crop_too_aggressive');

  let insetBuf = await sharp(input)
    .rotate()
    .extract({ left: li, top: ti, width: ew, height: eh })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();

  try {
    insetBuf = await sharp(insetBuf).trim({ threshold: 18 }).png().toBuffer();
  } catch {
    /* keep */
  }

  const scaled = await sharp(insetBuf)
    .resize(PREVIEW_HI_INSET_INNER_MAX, PREVIEW_HI_INSET_INNER_MAX, {
      fit: 'inside',
      background: { r: 255, g: 255, b: 255 },
    })
    .modulate({ saturation: 0.88, brightness: 1.05 })
    .png()
    .toBuffer();

  const m2 = await sharp(scaled).metadata();
  const w2 = m2.width ?? PREVIEW_HI_INSET_INNER_MAX;
  const h2 = m2.height ?? PREVIEW_HI_INSET_INNER_MAX;
  const lx = Math.floor((PREVIEW_HI_INSET_SIDE - w2) / 2);
  const ty = Math.floor((PREVIEW_HI_INSET_SIDE - h2) / 2);

  const onWhite = await sharp({
    create: {
      width: PREVIEW_HI_INSET_SIDE,
      height: PREVIEW_HI_INSET_SIDE,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: scaled, left: lx, top: ty }])
    .png()
    .toBuffer();

  return applyNeutralCrushOnRgbPng(onWhite);
}

export type RecipePreviewFidelity = 'low' | 'high';

/** P82/P83 — preview remediation for simulation ranking (not for publish). */
export async function applyRecipePreview(
  recipeId: string,
  profile: MarketplaceImagePolicyProfile,
  sourceBuffer: Buffer,
  insetOverride?: InsetCropFractions | null,
  fidelity: RecipePreviewFidelity = 'low'
): Promise<Buffer> {
  assertRecipeAllowed(recipeId, profile);
  if (recipeId === 'square_white_catalog_jpeg') {
    return fidelity === 'high'
      ? applySquareWhiteCatalogJpegPreviewHigh(sourceBuffer)
      : applySquareWhiteCatalogJpegPreview(sourceBuffer);
  }
  if (recipeId === 'inset_white_catalog_png') {
    return fidelity === 'high'
      ? applyInsetWhiteCatalogPngPreviewHigh(sourceBuffer, insetOverride ?? DEFAULT_INSET)
      : applyInsetWhiteCatalogPngPreview(sourceBuffer, insetOverride ?? DEFAULT_INSET);
  }
  throw new Error(`recipe_preview_not_implemented:${recipeId}`);
}
