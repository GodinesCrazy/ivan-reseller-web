import fs from 'fs';
import sharp from 'sharp';

/**
 * Permanent portada guardrail: fail-closed structural heuristics aligned with Mercado Libre live moderation
 * ("logos y/o textos", banners, promos, collage, screenshot-like UI). Not OCR — conservative cues only.
 */

export interface MlPortadaStrictGateResult {
  pass: boolean;
  signals: string[];
  metrics?: Record<string, number>;
}

const ANALYSIS = 480;

const RATIO_TOP_HARD = 1.72;
const RATIO_BOT_HARD = 1.62;
const RATIO_LEFT_HARD = 1.68;
const RATIO_RIGHT_HARD = 1.68;
/** Between soft and hard → fail closed (uncertainty). */
const RATIO_TOP_SOFT = 1.38;
const RATIO_BOT_SOFT = 1.32;
const RATIO_LR_SOFT = 1.34;

/** "Text-like" horizontal strokes in upper slice of the image. */
const TOP_BUSY_ROW_FRAC_FAIL = 0.2;
const ROW_HORIZONTAL_STROKE_MEAN = 10;

const GLOBAL_EDGE_BUSY = 78;
/** Raised slightly so single-subject catalog products (natural internal edges) are not conflated with sticker grids. */
const HIGH_CONTRAST_BLOCK_PCT_FAIL = 0.4;
const BLOCK_STDDEV_THRESHOLD = 32;

const FRAME_TO_CORE_EDGE_RATIO_FAIL = 1.52;

const VERTICAL_SEAM_COLUMN_HALF_WIDTH = 4;
const SEAM_TO_SIDE_EDGE_RATIO_FAIL = 2.35;
/** Vertical center seam alone matches some symmetric products; require fragmentation or strong seam energy for collage. */
const SEAM_MIN_ABSOLUTE_EDGE = 28;
const SEAM_REQUIRES_FRAGMENTATION = 0.3;

/**
 * White-background gate (P102): portada must be predominantly true white / near-white around the product.
 * This is intentionally strict and fail-closed because ML seller-center moderation flags
 * "No tiene fondo blanco" even when anti-text/collage checks pass.
 */
const WHITE_NEAR_RGB_MIN = 245;
const WHITE_PURE_RGB_MIN = 252;
// Raised from 0.58→0.62 and 0.28→0.40: gray (#dcdcdc = 220,220,220) backgrounds produce
// ~0% pure-white pixels and fail clearly; clean isolation on white easily clears both thresholds.
const WHITE_NEAR_DOMINANCE_MIN = 0.62;
const WHITE_PURE_DOMINANCE_MIN = 0.40;
const WHITE_BORDER_RATIO_MIN = 0.9;
const WHITE_CORNER_RATIO_MIN = 0.93;
const WHITE_BORDER_MEAN_LUMA_MIN = 246;
const WHITE_BORDER_LUMA_STD_MAX = 13;
const WHITE_BORDER_DARK_RATIO_MAX = 0.01;

const WHITE_BORDER_BAND_RATIO = 0.08;
const WHITE_CORNER_PATCH_RATIO = 0.12;
const WHITE_BORDER_DARK_LUMA_THRESHOLD = 220;

function bandEdgeMeanHorizontal(
  w: number,
  h: number,
  gx: Float32Array,
  gy: Float32Array,
  y0: number,
  y1: number
): number {
  let sum = 0;
  let n = 0;
  const yStart = Math.max(1, y0);
  const yEnd = Math.min(h - 1, y1);
  for (let y = yStart; y < yEnd; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      sum += Math.hypot(gx[i]!, gy[i]!);
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

function bandEdgeMeanVertical(
  w: number,
  h: number,
  gx: Float32Array,
  gy: Float32Array,
  x0: number,
  x1: number
): number {
  let sum = 0;
  let n = 0;
  const xStart = Math.max(1, x0);
  const xEnd = Math.min(w - 1, x1);
  for (let x = xStart; x < xEnd; x++) {
    for (let y = 1; y < h - 1; y++) {
      const i = y * w + x;
      sum += Math.hypot(gx[i]!, gy[i]!);
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

function meanHorizontalStrokeRow(data: Buffer, w: number, h: number, y: number): number {
  if (y <= 0 || y >= h - 1) return 0;
  let sum = 0;
  let n = 0;
  const row = y * w;
  for (let x = 0; x < w - 1; x++) {
    sum += Math.abs(data[row + x + 1]! - data[row + x]!);
    n++;
  }
  return n > 0 ? sum / n : 0;
}

function frameVsCoreEdgeRatio(
  w: number,
  h: number,
  gx: Float32Array,
  gy: Float32Array
): { frame: number; core: number; ratio: number } {
  const margin = Math.max(3, Math.floor(Math.min(w, h) * 0.13));
  let eFrame = 0;
  let nFrame = 0;
  let eCore = 0;
  let nCore = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const inCore = x >= margin && x < w - margin && y >= margin && y < h - margin;
      const v = Math.hypot(gx[i]!, gy[i]!);
      if (inCore) {
        eCore += v;
        nCore++;
      } else {
        eFrame += v;
        nFrame++;
      }
    }
  }
  const mF = nFrame > 0 ? eFrame / nFrame : 0;
  const mC = nCore > 0 ? eCore / nCore : 1e-6;
  return { frame: mF, core: mC, ratio: mC > 1e-6 ? mF / mC : mF > 8 ? 99 : 0 };
}

function analyzePortadaGreyscale(
  data: Buffer,
  w: number,
  h: number,
  gx: Float32Array,
  gy: Float32Array
): MlPortadaStrictGateResult {
  const topH = Math.max(2, Math.floor(h * 0.13));
  const botH = Math.max(2, Math.floor(h * 0.13));
  /** Wide enough to capture typical supplier sidebars / badges (~15–25% of width). */
  const sideW = Math.max(2, Math.floor(w * 0.22));
  const midY0 = Math.floor(h * 0.36);
  const midY1 = Math.floor(h * 0.64);
  const midX0 = Math.floor(w * 0.36);
  const midX1 = Math.floor(w * 0.64);

  const eTop = bandEdgeMeanHorizontal(w, h, gx, gy, 0, topH);
  const eBot = bandEdgeMeanHorizontal(w, h, gx, gy, h - botH, h);
  const eMid = bandEdgeMeanHorizontal(w, h, gx, gy, midY0, midY1);
  const eLeft = bandEdgeMeanVertical(w, h, gx, gy, 0, sideW);
  const eRight = bandEdgeMeanVertical(w, h, gx, gy, w - sideW, w);
  const eMidCol = bandEdgeMeanVertical(w, h, gx, gy, midX0, midX1);
  const eAll = bandEdgeMeanHorizontal(w, h, gx, gy, 0, h);

  const tol = 1e-4;
  const ratioTop = eMid > tol ? eTop / eMid : eTop > 12 ? 99 : 0;
  const ratioBot = eMid > tol ? eBot / eMid : eBot > 12 ? 99 : 0;
  const ratioLeft = eMidCol > tol ? eLeft / eMidCol : eLeft > 12 ? 99 : 0;
  const ratioRight = eMidCol > tol ? eRight / eMidCol : eRight > 12 ? 99 : 0;

  const topRegionEnd = Math.floor(h * 0.26);
  let busyRows = 0;
  let rowsCounted = 0;
  for (let y = 2; y < topRegionEnd; y++) {
    rowsCounted++;
    if (meanHorizontalStrokeRow(data, w, h, y) >= ROW_HORIZONTAL_STROKE_MEAN) busyRows++;
  }
  const topBusyRowFrac = rowsCounted > 0 ? busyRows / rowsCounted : 0;

  const cx = Math.floor(w / 2);
  const seamLo = Math.max(1, cx - VERTICAL_SEAM_COLUMN_HALF_WIDTH);
  const seamHi = Math.min(w - 1, cx + VERTICAL_SEAM_COLUMN_HALF_WIDTH);
  const eSeam = bandEdgeMeanVertical(w, h, gx, gy, seamLo, seamHi);
  const eSideRef = (eLeft + eRight) / 2 || 1e-6;
  const seamRatio = eSeam / eSideRef;

  const { ratio: frameCoreRatio } = frameVsCoreEdgeRatio(w, h, gx, gy);

  const cols = 10;
  const rows = 10;
  const bw = Math.floor(w / cols);
  const bh = Math.floor(h / rows);
  let highContrastBlocks = 0;
  const totalBlocks = cols * rows;
  for (let br = 0; br < rows; br++) {
    for (let bc = 0; bc < cols; bc++) {
      const x0 = bc * bw;
      const y0 = br * bh;
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      for (let y = y0; y < y0 + bh && y < h; y++) {
        for (let x = x0; x < x0 + bw && x < w; x++) {
          const v = data[y * w + x]!;
          sum += v;
          sumSq += v * v;
          n++;
        }
      }
      if (n < 2) continue;
      const mean = sum / n;
      const variance = Math.max(0, sumSq / n - mean * mean);
      const stdev = Math.sqrt(variance);
      if (stdev >= BLOCK_STDDEV_THRESHOLD) highContrastBlocks++;
    }
  }
  const highContrastBlockPct = highContrastBlocks / totalBlocks;

  const signals: string[] = [];

  if (ratioTop >= RATIO_TOP_HARD) signals.push('portada_top_band_edge_ratio_promo_or_text');
  if (ratioBot >= RATIO_BOT_HARD) signals.push('portada_bottom_band_edge_ratio_promo_or_text');
  if (ratioLeft >= RATIO_LEFT_HARD) signals.push('portada_left_sidebar_edge_ratio_graphic_risk');
  if (ratioRight >= RATIO_RIGHT_HARD) signals.push('portada_right_sidebar_edge_ratio_graphic_risk');

  if (ratioTop >= RATIO_TOP_SOFT && ratioTop < RATIO_TOP_HARD) {
    signals.push('portada_top_band_uncertain_fail_closed');
  }
  if (ratioBot >= RATIO_BOT_SOFT && ratioBot < RATIO_BOT_HARD) {
    signals.push('portada_bottom_band_uncertain_fail_closed');
  }
  if (ratioLeft >= RATIO_LR_SOFT && ratioLeft < RATIO_LEFT_HARD) {
    signals.push('portada_left_band_uncertain_fail_closed');
  }
  if (ratioRight >= RATIO_LR_SOFT && ratioRight < RATIO_RIGHT_HARD) {
    signals.push('portada_right_band_uncertain_fail_closed');
  }

  if (eAll >= GLOBAL_EDGE_BUSY && (ratioTop >= 1.22 || ratioBot >= 1.18 || ratioLeft >= 1.2 || ratioRight >= 1.2)) {
    signals.push('portada_global_busy_with_peripheral_graphics_bias');
  }

  if (topBusyRowFrac >= TOP_BUSY_ROW_FRAC_FAIL) {
    signals.push('portada_top_region_horizontal_stroke_density_text_like');
  }

  if (highContrastBlockPct >= HIGH_CONTRAST_BLOCK_PCT_FAIL) {
    signals.push('portada_high_local_contrast_fragmentation_sticker_collage_risk');
  }

  if (frameCoreRatio >= FRAME_TO_CORE_EDGE_RATIO_FAIL) {
    signals.push('portada_frame_edges_dominate_core_ui_or_banner_framing');
  }

  if (
    seamRatio >= SEAM_TO_SIDE_EDGE_RATIO_FAIL &&
    eSeam > SEAM_MIN_ABSOLUTE_EDGE &&
    highContrastBlockPct >= SEAM_REQUIRES_FRAGMENTATION
  ) {
    signals.push('portada_vertical_split_seam_collage_risk');
  }

  const pass = signals.length === 0;
  return {
    pass,
    signals,
    metrics: {
      edgeTop: eTop,
      edgeMid: eMid,
      edgeBot: eBot,
      edgeLeft: eLeft,
      edgeRight: eRight,
      ratioTop,
      ratioBot,
      ratioLeft,
      ratioRight,
      highContrastBlockPct,
      topBusyRowFrac,
      frameCoreRatio,
      seamRatio,
    },
  };
}

function analyzeWhiteBackgroundRgb(data: Buffer, w: number, h: number): MlPortadaStrictGateResult {
  const borderBand = Math.max(2, Math.floor(Math.min(w, h) * WHITE_BORDER_BAND_RATIO));
  const cornerPatch = Math.max(8, Math.floor(Math.min(w, h) * WHITE_CORNER_PATCH_RATIO));
  const cornerRects: Array<[number, number, number, number]> = [
    [0, 0, cornerPatch, cornerPatch],
    [w - cornerPatch, 0, w, cornerPatch],
    [0, h - cornerPatch, cornerPatch, h],
    [w - cornerPatch, h - cornerPatch, w, h],
  ];

  const isNearWhite = (r: number, g: number, b: number) =>
    r >= WHITE_NEAR_RGB_MIN && g >= WHITE_NEAR_RGB_MIN && b >= WHITE_NEAR_RGB_MIN;
  const isPureWhite = (r: number, g: number, b: number) =>
    r >= WHITE_PURE_RGB_MIN && g >= WHITE_PURE_RGB_MIN && b >= WHITE_PURE_RGB_MIN;

  let nearWhiteCount = 0;
  let pureWhiteCount = 0;
  let borderCount = 0;
  let borderNearWhite = 0;
  let borderDarkCount = 0;
  let borderLumSum = 0;
  let borderLumSqSum = 0;
  const cornerNearWhite = [0, 0, 0, 0];
  const cornerCount = [0, 0, 0, 0];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const nearW = isNearWhite(r, g, b);
      const pureW = isPureWhite(r, g, b);

      if (nearW) nearWhiteCount++;
      if (pureW) pureWhiteCount++;

      const isBorder =
        x < borderBand || y < borderBand || x >= w - borderBand || y >= h - borderBand;
      if (isBorder) {
        borderCount++;
        if (nearW) borderNearWhite++;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        borderLumSum += lum;
        borderLumSqSum += lum * lum;
        if (lum < WHITE_BORDER_DARK_LUMA_THRESHOLD) borderDarkCount++;
      }

      for (let c = 0; c < cornerRects.length; c++) {
        const [x0, y0, x1, y1] = cornerRects[c]!;
        if (x >= x0 && x < x1 && y >= y0 && y < y1) {
          cornerCount[c]! += 1;
          if (nearW) cornerNearWhite[c]! += 1;
        }
      }
    }
  }

  const total = Math.max(1, w * h);
  const nearWhiteDominance = nearWhiteCount / total;
  const pureWhiteDominance = pureWhiteCount / total;
  const borderNearWhiteRatio = borderNearWhite / Math.max(1, borderCount);
  const borderDarkRatio = borderDarkCount / Math.max(1, borderCount);
  const borderMeanLuma = borderLumSum / Math.max(1, borderCount);
  const borderLumaStd = Math.sqrt(
    Math.max(0, borderLumSqSum / Math.max(1, borderCount) - borderMeanLuma * borderMeanLuma)
  );
  const cornerRatios = cornerNearWhite.map((c, idx) => c / Math.max(1, cornerCount[idx]!));
  const cornerMinNearWhite = Math.min(...cornerRatios);

  const signals: string[] = [];
  if (nearWhiteDominance < WHITE_NEAR_DOMINANCE_MIN) {
    signals.push('portada_white_background_insufficient_near_white_dominance');
  }
  if (pureWhiteDominance < WHITE_PURE_DOMINANCE_MIN) {
    signals.push('portada_white_background_insufficient_true_white_pixels');
  }
  if (borderNearWhiteRatio < WHITE_BORDER_RATIO_MIN) {
    signals.push('portada_white_background_border_not_white_enough');
  }
  if (cornerMinNearWhite < WHITE_CORNER_RATIO_MIN) {
    signals.push('portada_white_background_corner_not_white_enough');
  }
  if (borderMeanLuma < WHITE_BORDER_MEAN_LUMA_MIN) {
    signals.push('portada_white_background_border_gray_cast');
  }
  if (borderLumaStd > WHITE_BORDER_LUMA_STD_MAX) {
    signals.push('portada_white_background_border_non_uniform');
  }
  if (borderDarkRatio > WHITE_BORDER_DARK_RATIO_MAX) {
    signals.push('portada_white_background_border_shadow_or_object_bleed');
  }

  return {
    pass: signals.length === 0,
    signals,
    metrics: {
      nearWhiteDominance,
      pureWhiteDominance,
      borderNearWhiteRatio,
      cornerNearWhiteTopLeft: cornerRatios[0]!,
      cornerNearWhiteTopRight: cornerRatios[1]!,
      cornerNearWhiteBottomLeft: cornerRatios[2]!,
      cornerNearWhiteBottomRight: cornerRatios[3]!,
      cornerMinNearWhite,
      borderMeanLuma,
      borderLumaStd,
      borderDarkRatio,
    },
  };
}

function buildDerivatives(data: Buffer, w: number, h: number, gx: Float32Array, gy: Float32Array): void {
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = data[i - w - 1]!;
      const t = data[i - w]!;
      const tr = data[i - w + 1]!;
      const l = data[i - 1]!;
      const r = data[i + 1]!;
      const bl = data[i + w - 1]!;
      const b = data[i + w]!;
      const br = data[i + w + 1]!;
      gx[i] = -tl + tr - 2 * l + 2 * r - bl + br;
      gy[i] = -tl - 2 * t - tr + bl + 2 * b + br;
    }
  }
}

/**
 * P103 — Natural catalog-photo proxy result (sticker/cutout/halo heuristics).
 */
export interface MlPortadaNaturalLookGateResult {
  pass: boolean;
  signals: string[];
  metrics?: Record<string, number>;
}

/** Interior of isolated subject on white should not be near-uniform (flat sticker / cutout). */
const NATURAL_CORE_STDDEV_MIN = 2.55;
/** Harsh silhouette vs calm white halo: high boundary gradient vs low white-field gradient. */
/** Tuned so soft-alpha reconstruction (P103) is not rejected solely by a sharp but legitimate silhouette. */
const NATURAL_BOUNDARY_TO_WHITE_GRAD_RATIO_MAX = 118;
/** Colored halos leaking into nominally white border band. */
const NATURAL_FRINGE_CHROMA_RATIO_MAX = 0.042;
const NATURAL_BORDER_FRAC = 0.085;

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

function subtractMask(a: Uint8Array, b: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    o[i] = a[i] && !b[i] ? 1 : 0;
  }
  return o;
}

function repeatErode(mask: Uint8Array, w: number, h: number, times: number): Uint8Array {
  let m = mask;
  for (let t = 0; t < times; t++) {
    m = binaryErode1(m, w, h);
  }
  return m;
}

function repeatDilate(mask: Uint8Array, w: number, h: number, times: number): Uint8Array {
  let m = mask;
  for (let t = 0; t < times; t++) {
    m = binaryDilate1(m, w, h);
  }
  return m;
}

function analyzeNaturalLookGreyRgb(
  rgb: Buffer,
  gray: Buffer,
  w: number,
  h: number,
  gx: Float32Array,
  gy: Float32Array
): MlPortadaNaturalLookGateResult {
  const n = w * h;
  const rawSubject = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const r = rgb[o]!;
    const g = rgb[o + 1]!;
    const b = rgb[o + 2]!;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    rawSubject[i] = gray[i]! < 246 || chroma > 13 ? 1 : 0;
  }

  let fg = binaryErode1(rawSubject, w, h);
  fg = binaryDilate1(fg, w, h);
  fg = binaryDilate1(fg, w, h);
  fg = binaryErode1(fg, w, h);

  const inner = repeatErode(fg, w, h, 4);
  const inner2 = binaryErode1(inner, w, h);
  const outer = repeatDilate(fg, w, h, 5);
  const boundaryRing = subtractMask(outer, inner, w, h);

  let coreSum = 0;
  let coreSumSq = 0;
  let coreN = 0;
  for (let i = 0; i < n; i++) {
    if (!inner2[i]) continue;
    const v = gray[i]!;
    coreSum += v;
    coreSumSq += v * v;
    coreN++;
  }

  let coreStd = 0;
  if (coreN > 12) {
    const mean = coreSum / coreN;
    coreStd = Math.sqrt(Math.max(0, coreSumSq / coreN - mean * mean));
  }

  let bGrad = 0;
  let bN = 0;
  let wGrad = 0;
  let wN = 0;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const g = Math.hypot(gx[i]!, gy[i]!);
      if (boundaryRing[i]) {
        bGrad += g;
        bN++;
      }
      const nearWhite = gray[i]! >= 251;
      const nearEdge = x < w * NATURAL_BORDER_FRAC || x >= w * (1 - NATURAL_BORDER_FRAC) || y < h * NATURAL_BORDER_FRAC || y > h * (1 - NATURAL_BORDER_FRAC);
      if (nearWhite && nearEdge && !fg[i]) {
        wGrad += g;
        wN++;
      }
    }
  }

  const boundaryMeanGrad = bN > 0 ? bGrad / bN : 0;
  const whiteFieldMeanGrad = wN > 0 ? wGrad / wN : 0.001;
  const transitionRatio = boundaryMeanGrad / (whiteFieldMeanGrad + 0.35);

  const borderBand = Math.max(2, Math.floor(Math.min(w, h) * NATURAL_BORDER_FRAC));
  let fringeChroma = 0;
  let fringeN = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge =
        x < borderBand || y < borderBand || x >= w - borderBand || y >= h - borderBand;
      if (!edge) continue;
      const o = (y * w + x) * 3;
      const r = rgb[o]!;
      const g = rgb[o + 1]!;
      const b = rgb[o + 2]!;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (lum >= 244) {
        fringeN++;
        if (chroma > 20) fringeChroma++;
      }
    }
  }
  const fringeChromaRatio = fringeN > 0 ? fringeChroma / fringeN : 0;

  let fgCount = 0;
  for (let i = 0; i < n; i++) {
    if (fg[i]) fgCount++;
  }
  const subjectAreaRatio = fgCount / n;

  const signals: string[] = [];
  if (coreN < 80 || coreStd < NATURAL_CORE_STDDEV_MIN) {
    signals.push('portada_natural_look_subject_interior_too_uniform_sticker_risk');
  }
  if (subjectAreaRatio < 0.06 || subjectAreaRatio > 0.9) {
    signals.push('portada_natural_look_subject_extent_extreme_composition_risk');
  }
  if (transitionRatio > NATURAL_BOUNDARY_TO_WHITE_GRAD_RATIO_MAX) {
    signals.push('portada_natural_look_harsh_silhouette_vs_white_field_sticker_or_cutout_risk');
  }
  if (fringeChromaRatio > NATURAL_FRINGE_CHROMA_RATIO_MAX) {
    signals.push('portada_natural_look_colored_halo_or_tint_in_white_border');
  }

  return {
    pass: signals.length === 0,
    signals,
    metrics: {
      naturalCoreStddev: Number(coreStd.toFixed(4)),
      naturalBoundaryMeanGrad: Number(boundaryMeanGrad.toFixed(4)),
      naturalWhiteFieldMeanGrad: Number(whiteFieldMeanGrad.toFixed(4)),
      naturalTransitionRatio: Number(transitionRatio.toFixed(3)),
      naturalFringeChromaRatio: Number(fringeChromaRatio.toFixed(5)),
      naturalSubjectAreaRatio: Number(subjectAreaRatio.toFixed(4)),
      naturalCorePixelCount: coreN,
    },
  };
}

/**
 * P103 — Fail-closed “natural catalog photo” proxy: penalizes flat cutouts, harsh silhouettes, and tinted white borders.
 * Complements structural + white-background strict gates (Seller Center is truth; this reduces sticker/collage feel).
 */
export async function evaluateMlPortadaNaturalLookGateFromBuffer(
  imageBuffer: Buffer
): Promise<MlPortadaNaturalLookGateResult> {
  if (!imageBuffer || imageBuffer.length < 32) {
    return { pass: false, signals: ['portada_natural_look_buffer_missing_or_too_small'] };
  }

  const { data, info } = await sharp(imageBuffer)
    .rotate()
    .resize(ANALYSIS, ANALYSIS, { fit: 'cover', position: 'centre' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const gray = Buffer.allocUnsafe(w * h);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 1) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    gray[j] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  buildDerivatives(gray, w, h, gx, gy);

  return analyzeNaturalLookGreyRgb(data, gray, w, h, gx, gy);
}

export async function evaluateMlPortadaNaturalLookGate(imagePath: string): Promise<MlPortadaNaturalLookGateResult> {
  if (!imagePath || !fs.existsSync(imagePath)) {
    return { pass: false, signals: ['portada_natural_look_path_missing_or_unreadable'] };
  }
  const buf = await fs.promises.readFile(imagePath);
  return evaluateMlPortadaNaturalLookGateFromBuffer(buf);
}

export async function evaluateMlPortadaStrictAndNaturalGateFromBuffer(
  imageBuffer: Buffer
): Promise<{ pass: boolean; signals: string[]; metrics?: Record<string, number> }> {
  const strict = await evaluateMlPortadaStrictGateFromBuffer(imageBuffer);
  const natural = await evaluateMlPortadaNaturalLookGateFromBuffer(imageBuffer);
  return {
    pass: strict.pass && natural.pass,
    signals: [...strict.signals, ...natural.signals],
    metrics: { ...(strict.metrics || {}), ...(natural.metrics || {}) },
  };
}

export async function evaluateMlPortadaStrictGateFromBuffer(imageBuffer: Buffer): Promise<MlPortadaStrictGateResult> {
  if (!imageBuffer || imageBuffer.length < 32) {
    return { pass: false, signals: ['portada_buffer_missing_or_too_small'] };
  }

  const { data, info } = await sharp(imageBuffer)
    .rotate()
    .resize(ANALYSIS, ANALYSIS, { fit: 'cover', position: 'centre' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const gray = Buffer.allocUnsafe(w * h);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 1) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    gray[j] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  buildDerivatives(gray, w, h, gx, gy);

  const structural = analyzePortadaGreyscale(gray, w, h, gx, gy);
  const whiteBg = analyzeWhiteBackgroundRgb(data, w, h);
  return {
    pass: structural.pass && whiteBg.pass,
    signals: [...structural.signals, ...whiteBg.signals],
    metrics: {
      ...(structural.metrics || {}),
      ...(whiteBg.metrics || {}),
    },
  };
}

/**
 * Strict portada gate on filesystem path (pack inspection, scripts).
 */
export async function evaluateMlPortadaStrictGate(imagePath: string): Promise<MlPortadaStrictGateResult> {
  if (!imagePath || !fs.existsSync(imagePath)) {
    return { pass: false, signals: ['portada_path_missing_or_unreadable'] };
  }
  const buf = await fs.promises.readFile(imagePath);
  return evaluateMlPortadaStrictGateFromBuffer(buf);
}
