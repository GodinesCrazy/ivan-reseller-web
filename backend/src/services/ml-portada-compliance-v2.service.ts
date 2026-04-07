/**
 * ML Portada Compliance V2 — comprehensive validator aligned with Mercado Libre's real moderation
 * checks (white_background, logo_text_watermark, minimum_size, blur, multiproduct, unprofessional_photo).
 *
 * Design principles:
 *  - No OCR library required: text/logo detection is heuristic (gradient + stroke density + aspect ratio).
 *  - White background check is stricter than V1: requires both near-white dominance AND adequate pure-white pixels.
 *  - Object composition check: product must cover 35–90% of canvas and be reasonably centred.
 *  - Over-exposure check: rejects images where the product itself is washed out (not just background).
 *  - Returns a per-check breakdown and an overall compliance score (0–100).
 */
import sharp from 'sharp';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ComplianceCheckResult {
  pass: boolean;
  score: number; // 0–100 contribution to overall score
  signals: string[];
  metrics?: Record<string, number | string>;
}

export interface PortadaComplianceV2Report {
  /** All checks passed AND overall score >= PASS_THRESHOLD. */
  compliant: boolean;
  /** 0–100. Score >= 75 required. */
  overallScore: number;
  checks: {
    whiteBg: ComplianceCheckResult;
    textLogo: ComplianceCheckResult;
    objectComposition: ComplianceCheckResult;
    overExposure: ComplianceCheckResult;
    sharpness: ComplianceCheckResult;
    multiProduct: ComplianceCheckResult;
  };
  rejectionReasons: string[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const ANALYSIS_SIZE = 480;
const PASS_THRESHOLD = 75;

// White background
const WB_NEAR_WHITE_MIN = 245;   // each channel >=245 = near-white pixel
const WB_PURE_WHITE_MIN = 248;   // each channel >=248 = pure-white pixel (allows for JPEG compression)
// Dominance thresholds are generous: a 78% fill product leaves only ~36% white area.
// The real discrimination between white and gray happens in the border/corner checks.
const WB_NEAR_DOMINANCE_REQUIRED = 0.30;  // >=30% of total pixels must be near-white (catches fully-gray images)
const WB_PURE_DOMINANCE_REQUIRED = 0.15;  // >=15% of total pixels must be pure-white (gray #DCDCDC produces 0%)
const WB_BORDER_BAND = 0.08;              // 8% of min(w,h) for border band
const WB_BORDER_NEAR_WHITE_REQUIRED = 0.90; // PRIMARY check: 90% of border band must be white
const WB_CORNER_PATCH = 0.12;
const WB_CORNER_NEAR_WHITE_REQUIRED = 0.93; // PRIMARY check: 93% of corner patches must be white
const WB_BORDER_LUMA_MIN = 240;   // border mean luma — catches gray (#DCDCDC luma=220) but allows slight off-white
const WB_BORDER_LUMA_STD_MAX = 18;

// Text/logo detection
const TL_TOP_EDGE_RATIO_FAIL = 1.72;
const TL_BOT_EDGE_RATIO_FAIL = 1.62;
const TL_LR_EDGE_RATIO_FAIL = 1.68;
const TL_TOP_BUSY_FRAC_FAIL = 0.20;   // >20% of top rows with horizontal strokes = text-like
const TL_HIGH_CONTRAST_BLOCK_FAIL = 0.40;

// Object composition
const OC_MIN_SUBJECT_AREA = 0.35;  // product must cover at least 35% of canvas
const OC_MAX_SUBJECT_AREA = 0.91;  // and at most 91%
const OC_MIN_WIDTH_RATIO = 0.30;
const OC_MIN_HEIGHT_RATIO = 0.30;
const OC_MAX_CENTRE_OFFSET = 0.20; // bbox centre must be within 20% of canvas centre

// Over-exposure (product washed out)
const OE_PRODUCT_NEAR_WHITE_MAX = 0.92; // if >92% of product area is near-white → washed out

// Sharpness (Laplacian variance on 480×480 greyscale).
// Values: sigma-30 blur: ~1–5; sigma-5 blur: ~30–80; acceptably sharp photo: ~100+.
// Threshold is conservative to avoid rejecting valid high-detail products.
const SH_LAPLACIAN_VAR_MIN = 12; // below this = blurry image (sigma-40 blur → ~1–5; real sharp photo → 50+)

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildGradients(gray: Buffer, w: number, h: number): { gx: Float32Array; gy: Float32Array } {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = gray[i - w - 1]!; const t = gray[i - w]!; const tr = gray[i - w + 1]!;
      const l = gray[i - 1]!;                               const r = gray[i + 1]!;
      const bl = gray[i + w - 1]!; const b = gray[i + w]!; const br = gray[i + w + 1]!;
      gx[i] = -tl + tr - 2 * l + 2 * r - bl + br;
      gy[i] = -tl - 2 * t - tr + bl + 2 * b + br;
    }
  }
  return { gx, gy };
}

function bandEdgeMean(
  w: number, h: number, gx: Float32Array, gy: Float32Array,
  x0: number, x1: number, y0: number, y1: number
): number {
  let sum = 0; let n = 0;
  for (let y = Math.max(1, y0); y < Math.min(h - 1, y1); y++) {
    for (let x = Math.max(1, x0); x < Math.min(w - 1, x1); x++) {
      sum += Math.hypot(gx[y * w + x]!, gy[y * w + x]!);
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

function rowHorizStrokeMean(gray: Buffer, w: number, y: number): number {
  if (y <= 0) return 0;
  let sum = 0;
  for (let x = 0; x < w - 1; x++) sum += Math.abs(gray[y * w + x + 1]! - gray[y * w + x]!);
  return sum / (w - 1);
}

// ── Check: White Background ───────────────────────────────────────────────────

function checkWhiteBackground(rgb: Buffer, w: number, h: number): ComplianceCheckResult {
  const borderBand = Math.max(2, Math.floor(Math.min(w, h) * WB_BORDER_BAND));
  const cornerPatch = Math.max(8, Math.floor(Math.min(w, h) * WB_CORNER_PATCH));

  let nearWhite = 0, pureWhite = 0, total = 0;
  let borderNear = 0, borderCount = 0;
  let borderLumSum = 0, borderLumSqSum = 0;
  const cNear = [0, 0, 0, 0]; const cTotal = [0, 0, 0, 0];
  const corners: [number, number, number, number][] = [
    [0, 0, cornerPatch, cornerPatch],
    [w - cornerPatch, 0, w, cornerPatch],
    [0, h - cornerPatch, cornerPatch, h],
    [w - cornerPatch, h - cornerPatch, w, h],
  ];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const r = rgb[o]!; const g = rgb[o + 1]!; const b = rgb[o + 2]!;
      const near = r >= WB_NEAR_WHITE_MIN && g >= WB_NEAR_WHITE_MIN && b >= WB_NEAR_WHITE_MIN;
      const pure = r >= WB_PURE_WHITE_MIN && g >= WB_PURE_WHITE_MIN && b >= WB_PURE_WHITE_MIN;
      if (near) nearWhite++;
      if (pure) pureWhite++;
      total++;

      const border = x < borderBand || y < borderBand || x >= w - borderBand || y >= h - borderBand;
      if (border) {
        borderCount++;
        if (near) borderNear++;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        borderLumSum += lum;
        borderLumSqSum += lum * lum;
      }
      for (let c = 0; c < 4; c++) {
        const [cx0, cy0, cx1, cy1] = corners[c]!;
        if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) {
          cTotal[c]!++;
          if (near) cNear[c]!++;
        }
      }
    }
  }

  const nearDom = nearWhite / total;
  const pureDom = pureWhite / total;
  const borderNearRatio = borderNear / Math.max(1, borderCount);
  const borderMeanLuma = borderLumSum / Math.max(1, borderCount);
  const borderLumaStd = Math.sqrt(
    Math.max(0, borderLumSqSum / Math.max(1, borderCount) - borderMeanLuma * borderMeanLuma)
  );
  const cornerMin = Math.min(...cNear.map((n, i) => n / Math.max(1, cTotal[i]!)));

  const signals: string[] = [];
  if (nearDom < WB_NEAR_DOMINANCE_REQUIRED) signals.push(`white_bg_near_dominance_${(nearDom * 100).toFixed(1)}pct_below_${(WB_NEAR_DOMINANCE_REQUIRED * 100).toFixed(0)}pct`);
  if (pureDom < WB_PURE_DOMINANCE_REQUIRED) signals.push(`white_bg_pure_dominance_${(pureDom * 100).toFixed(1)}pct_below_${(WB_PURE_DOMINANCE_REQUIRED * 100).toFixed(0)}pct`);
  if (borderNearRatio < WB_BORDER_NEAR_WHITE_REQUIRED) signals.push(`white_bg_border_${(borderNearRatio * 100).toFixed(1)}pct_not_white`);
  if (cornerMin < WB_CORNER_NEAR_WHITE_REQUIRED) signals.push(`white_bg_corner_${(cornerMin * 100).toFixed(1)}pct_not_white`);
  if (borderMeanLuma < WB_BORDER_LUMA_MIN) signals.push(`white_bg_border_luma_${borderMeanLuma.toFixed(0)}_gray_cast`);
  if (borderLumaStd > WB_BORDER_LUMA_STD_MAX) signals.push(`white_bg_border_luma_std_${borderLumaStd.toFixed(1)}_non_uniform`);

  const pass = signals.length === 0;
  // Score: 100 when fully white, 0 when clearly non-white
  const score = pass ? 100 : Math.max(0, Math.round(
    (nearDom / WB_NEAR_DOMINANCE_REQUIRED) * 40 +
    (pureDom / WB_PURE_DOMINANCE_REQUIRED) * 30 +
    (borderNearRatio / WB_BORDER_NEAR_WHITE_REQUIRED) * 20 +
    (cornerMin / WB_CORNER_NEAR_WHITE_REQUIRED) * 10
  ) - 10);

  return {
    pass, score: pass ? 100 : Math.min(score, 85),
    signals,
    metrics: {
      nearDominance: Number(nearDom.toFixed(3)),
      pureDominance: Number(pureDom.toFixed(3)),
      borderNearRatio: Number(borderNearRatio.toFixed(3)),
      cornerMinNearWhite: Number(cornerMin.toFixed(3)),
      borderMeanLuma: Number(borderMeanLuma.toFixed(1)),
      borderLumaStd: Number(borderLumaStd.toFixed(2)),
    },
  };
}

// ── Check: Text / Logo ────────────────────────────────────────────────────────

function checkTextLogo(
  gray: Buffer, w: number, h: number, gx: Float32Array, gy: Float32Array
): ComplianceCheckResult {
  const topH = Math.max(2, Math.floor(h * 0.13));
  const botH = Math.max(2, Math.floor(h * 0.13));
  // Side band is capped at 10% so that a centred product at ≥80% fill does NOT have its
  // own boundary inside the side band. Products start at (1–fill)/2 ≥ 0.10 from the edge
  // when fill ≤ 80%. Sidebar logos/badges typically appear within the outer 8–12%.
  const sideW = Math.max(2, Math.floor(w * 0.10));
  const midY0 = Math.floor(h * 0.36); const midY1 = Math.floor(h * 0.64);
  const midX0 = Math.floor(w * 0.36); const midX1 = Math.floor(w * 0.64);

  const eTop = bandEdgeMean(w, h, gx, gy, 0, w, 0, topH);
  const eBot = bandEdgeMean(w, h, gx, gy, 0, w, h - botH, h);
  const eLeft = bandEdgeMean(w, h, gx, gy, 0, sideW, 0, h);
  const eRight = bandEdgeMean(w, h, gx, gy, w - sideW, w, 0, h);
  const eMid = bandEdgeMean(w, h, gx, gy, 0, w, midY0, midY1);
  const eMidCol = bandEdgeMean(w, h, gx, gy, midX0, midX1, 0, h);
  const tol = 1e-4;

  const rTop = eMid > tol ? eTop / eMid : eTop > 12 ? 99 : 0;
  const rBot = eMid > tol ? eBot / eMid : eBot > 12 ? 99 : 0;
  const rLeft = eMidCol > tol ? eLeft / eMidCol : eLeft > 12 ? 99 : 0;
  const rRight = eMidCol > tol ? eRight / eMidCol : eRight > 12 ? 99 : 0;

  // Horizontal stroke density in top 26% of image → text-like pattern
  const topEnd = Math.floor(h * 0.26);
  let busyRows = 0; let rowsChecked = 0;
  for (let y = 2; y < topEnd; y++) {
    rowsChecked++;
    if (rowHorizStrokeMean(gray, w, y) >= 10) busyRows++;
  }
  const topBusyFrac = rowsChecked > 0 ? busyRows / rowsChecked : 0;

  // High-contrast block fragmentation (sticker / collage grid)
  const cols = 10; const rows = 10;
  const bw = Math.floor(w / cols); const bh = Math.floor(h / rows);
  let hcBlocks = 0;
  for (let br = 0; br < rows; br++) {
    for (let bc = 0; bc < cols; bc++) {
      let sum = 0; let sumSq = 0; let n = 0;
      for (let y = br * bh; y < br * bh + bh && y < h; y++) {
        for (let x = bc * bw; x < bc * bw + bw && x < w; x++) {
          const v = gray[y * w + x]!;
          sum += v; sumSq += v * v; n++;
        }
      }
      if (n < 2) continue;
      const mean = sum / n;
      const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
      if (std >= 32) hcBlocks++;
    }
  }
  const hcFrac = hcBlocks / (cols * rows);

  const signals: string[] = [];
  if (rTop >= TL_TOP_EDGE_RATIO_FAIL) signals.push(`text_logo_top_edge_ratio_${rTop.toFixed(2)}_promo_or_text`);
  if (rBot >= TL_BOT_EDGE_RATIO_FAIL) signals.push(`text_logo_bottom_edge_ratio_${rBot.toFixed(2)}_promo_or_text`);
  if (rLeft >= TL_LR_EDGE_RATIO_FAIL) signals.push(`text_logo_left_sidebar_${rLeft.toFixed(2)}_graphic_risk`);
  if (rRight >= TL_LR_EDGE_RATIO_FAIL) signals.push(`text_logo_right_sidebar_${rRight.toFixed(2)}_graphic_risk`);
  if (topBusyFrac >= TL_TOP_BUSY_FRAC_FAIL) signals.push(`text_logo_top_horizontal_stroke_density_${(topBusyFrac * 100).toFixed(0)}pct_text_like`);
  if (hcFrac >= TL_HIGH_CONTRAST_BLOCK_FAIL) signals.push(`text_logo_high_contrast_block_fragmentation_${(hcFrac * 100).toFixed(0)}pct_sticker_collage_risk`);

  const pass = signals.length === 0;
  return {
    pass, score: pass ? 100 : 0,
    signals,
    metrics: {
      edgeRatioTop: Number(rTop.toFixed(3)),
      edgeRatioBot: Number(rBot.toFixed(3)),
      edgeRatioLeft: Number(rLeft.toFixed(3)),
      edgeRatioRight: Number(rRight.toFixed(3)),
      topBusyRowFrac: Number(topBusyFrac.toFixed(3)),
      highContrastBlockFrac: Number(hcFrac.toFixed(3)),
    },
  };
}

// ── Check: Object Composition ─────────────────────────────────────────────────

function checkObjectComposition(rgb: Buffer, gray: Buffer, w: number, h: number): ComplianceCheckResult {
  // Subject mask: pixels not near-white (they are product)
  let xMin = w, xMax = 0, yMin = h, yMax = 0;
  let subjectCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const r = rgb[o]!; const g = rgb[o + 1]!; const b = rgb[o + 2]!;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      // Non-white: luma below near-white threshold OR has chroma (coloured)
      const isSubject = gray[y * w + x]! < WB_NEAR_WHITE_MIN || chroma > 13;
      if (isSubject) {
        subjectCount++;
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
  }

  const total = w * h;
  const subjectAreaRatio = subjectCount / total;
  const bboxW = xMax > xMin ? (xMax - xMin) / w : 0;
  const bboxH = yMax > yMin ? (yMax - yMin) / h : 0;
  const bboxArea = bboxW * bboxH;

  // Centring: bbox centre vs canvas centre
  const bboxCx = xMin < w && xMax > 0 ? (xMin + xMax) / 2 / w : 0.5;
  const bboxCy = yMin < h && yMax > 0 ? (yMin + yMax) / 2 / h : 0.5;
  const centreOffsetX = Math.abs(bboxCx - 0.5);
  const centreOffsetY = Math.abs(bboxCy - 0.5);
  const maxCentreOffset = Math.max(centreOffsetX, centreOffsetY);

  // Check if subject is touching any edge (product cropped)
  const touchesEdge =
    (xMin <= 1 || xMax >= w - 2 || yMin <= 1 || yMax >= h - 2) && subjectCount > 200;

  const signals: string[] = [];
  if (subjectAreaRatio < OC_MIN_SUBJECT_AREA) {
    signals.push(`composition_subject_area_${(subjectAreaRatio * 100).toFixed(1)}pct_below_${(OC_MIN_SUBJECT_AREA * 100).toFixed(0)}pct_product_too_small`);
  }
  if (subjectAreaRatio > OC_MAX_SUBJECT_AREA) {
    signals.push(`composition_subject_area_${(subjectAreaRatio * 100).toFixed(1)}pct_above_${(OC_MAX_SUBJECT_AREA * 100).toFixed(0)}pct_no_margin`);
  }
  if (bboxW < OC_MIN_WIDTH_RATIO) {
    signals.push(`composition_bbox_width_${(bboxW * 100).toFixed(1)}pct_too_narrow`);
  }
  if (bboxH < OC_MIN_HEIGHT_RATIO) {
    signals.push(`composition_bbox_height_${(bboxH * 100).toFixed(1)}pct_too_short`);
  }
  if (maxCentreOffset > OC_MAX_CENTRE_OFFSET) {
    signals.push(`composition_centre_offset_${(maxCentreOffset * 100).toFixed(1)}pct_product_not_centred`);
  }
  if (touchesEdge) {
    signals.push('composition_product_touches_or_crops_at_edge');
  }

  const pass = signals.length === 0;
  // Score rewards good coverage and centring
  const coverageScore = Math.min(100, Math.max(0,
    subjectAreaRatio >= OC_MIN_SUBJECT_AREA && subjectAreaRatio <= OC_MAX_SUBJECT_AREA ? 100 :
    subjectAreaRatio < OC_MIN_SUBJECT_AREA ? (subjectAreaRatio / OC_MIN_SUBJECT_AREA) * 60 : 60
  ));
  const centreScore = Math.max(0, 100 - maxCentreOffset * 300);
  const score = Math.round((coverageScore * 0.7 + centreScore * 0.3));

  return {
    pass, score: pass ? 100 : Math.min(score, 80),
    signals,
    metrics: {
      subjectAreaRatio: Number(subjectAreaRatio.toFixed(3)),
      bboxWidthRatio: Number(bboxW.toFixed(3)),
      bboxHeightRatio: Number(bboxH.toFixed(3)),
      bboxAreaRatio: Number(bboxArea.toFixed(3)),
      centreOffsetX: Number(centreOffsetX.toFixed(3)),
      centreOffsetY: Number(centreOffsetY.toFixed(3)),
      touchesEdge: touchesEdge ? 1 : 0,
    },
  };
}

// ── Check: Over-Exposure ──────────────────────────────────────────────────────

function checkOverExposure(rgb: Buffer, gray: Buffer, w: number, h: number): ComplianceCheckResult {
  // Only evaluate product pixels (non-white subject)
  let subjectTotal = 0; let subjectNearWhite = 0;
  for (let i = 0, gi = 0; i < rgb.length; i += 3, gi++) {
    const r = rgb[i]!; const g = rgb[i + 1]!; const b = rgb[i + 2]!;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const luma = gray[gi]!;
    const isSubject = luma < WB_NEAR_WHITE_MIN || chroma > 13;
    if (isSubject) {
      subjectTotal++;
      if (r > 240 && g > 240 && b > 240) subjectNearWhite++;
    }
  }

  if (subjectTotal < 200) {
    return {
      pass: false, score: 0,
      signals: ['over_exposure_insufficient_subject_pixels_detected'],
      metrics: { subjectPixels: subjectTotal },
    };
  }

  const productNearWhitePct = subjectNearWhite / subjectTotal;
  const signals: string[] = [];
  if (productNearWhitePct > OE_PRODUCT_NEAR_WHITE_MAX) {
    signals.push(`over_exposure_product_${(productNearWhitePct * 100).toFixed(1)}pct_near_white_washed_out`);
  }

  const pass = signals.length === 0;
  const score = pass ? 100 : Math.max(0, Math.round((1 - productNearWhitePct) * 100));
  return {
    pass, score,
    signals,
    metrics: {
      subjectPixels: subjectTotal,
      productNearWhitePct: Number(productNearWhitePct.toFixed(3)),
    },
  };
}

// ── Check: Sharpness ─────────────────────────────────────────────────────────

function checkSharpness(gray: Buffer, w: number, h: number): ComplianceCheckResult {
  // Laplacian variance on greyscale: measures high-frequency detail.
  let sum = 0; let sumSq = 0; let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = -gray[i - w]! - gray[i - 1]! + 4 * gray[i]! - gray[i + 1]! - gray[i + w]!;
      sum += lap; sumSq += lap * lap; n++;
    }
  }
  const mean = n > 0 ? sum / n : 0;
  const variance = n > 0 ? sumSq / n - mean * mean : 0;

  const signals: string[] = [];
  if (variance < SH_LAPLACIAN_VAR_MIN) {
    signals.push(`sharpness_laplacian_variance_${variance.toFixed(1)}_below_${SH_LAPLACIAN_VAR_MIN}_image_blurry`);
  }

  const pass = signals.length === 0;
  const score = pass ? 100 : Math.max(0, Math.round((variance / SH_LAPLACIAN_VAR_MIN) * 80));
  return {
    pass, score,
    signals,
    metrics: { laplacianVariance: Number(variance.toFixed(2)) },
  };
}

// ── Check: Multi-product ──────────────────────────────────────────────────────

function checkMultiProduct(rgb: Buffer, gray: Buffer, w: number, h: number): ComplianceCheckResult {
  // Heuristic: detect a significant vertical gap in the subject that divides it into
  // two separate regions — typical of side-by-side multiple product images.
  // This is conservative: only flags clear separations.

  // Build row-based subject presence (1 if row has significant subject content)
  const MIN_SUBJECT_COLS_RATIO = 0.10;
  const ROW_PRESENCE: boolean[] = [];
  for (let y = 0; y < h; y++) {
    let subjectCols = 0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const r = rgb[o]!; const g = rgb[o + 1]!; const b = rgb[o + 2]!;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (gray[y * w + x]! < WB_NEAR_WHITE_MIN || chroma > 13) subjectCols++;
    }
    ROW_PRESENCE.push(subjectCols / w >= MIN_SUBJECT_COLS_RATIO);
  }

  // Build column-based subject presence
  const COL_PRESENCE: boolean[] = [];
  for (let x = 0; x < w; x++) {
    let subjectRows = 0;
    for (let y = 0; y < h; y++) {
      const o = (y * w + x) * 3;
      const r = rgb[o]!; const gg = rgb[o + 1]!; const b = rgb[o + 2]!;
      const chroma = Math.max(r, gg, b) - Math.min(r, gg, b);
      if (gray[y * w + x]! < WB_NEAR_WHITE_MIN || chroma > 13) subjectRows++;
    }
    COL_PRESENCE.push(subjectRows / h >= MIN_SUBJECT_COLS_RATIO);
  }

  // Count vertical gaps (columns of white that fully separate subject left/right)
  function countSeparatingGaps(presence: boolean[], minGapFrac: number): number {
    const minGap = Math.max(2, Math.floor(presence.length * minGapFrac));
    let gaps = 0;
    let inGap = false;
    let gapLen = 0;
    let hadSubject = false;
    let afterSubjectGap = false;
    for (const p of presence) {
      if (p) {
        hadSubject = true;
        if (inGap && gapLen >= minGap) {
          afterSubjectGap = true;
          gaps++;
        }
        inGap = false;
        gapLen = 0;
      } else {
        if (hadSubject) { inGap = true; gapLen++; }
      }
    }
    void afterSubjectGap;
    return gaps;
  }

  const colGaps = countSeparatingGaps(COL_PRESENCE, 0.07);
  const rowGaps = countSeparatingGaps(ROW_PRESENCE, 0.07);

  const signals: string[] = [];
  if (colGaps >= 2) {
    signals.push(`multi_product_${colGaps}_vertical_separating_gaps_detected`);
  }
  if (rowGaps >= 2) {
    signals.push(`multi_product_${rowGaps}_horizontal_separating_gaps_detected`);
  }

  const pass = signals.length === 0;
  return {
    pass, score: pass ? 100 : 0,
    signals,
    metrics: { columnGaps: colGaps, rowGaps },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs all compliance checks on the given image buffer.
 * Returns a PortadaComplianceV2Report with per-check results and overall score.
 *
 * Weights: whiteBg=30, textLogo=25, composition=20, overExposure=10, sharpness=10, multiProduct=5
 */
export async function evaluatePortadaComplianceV2(
  imageBuffer: Buffer
): Promise<PortadaComplianceV2Report> {
  if (!imageBuffer || imageBuffer.length < 32) {
    const fail = (reason: string): ComplianceCheckResult => ({
      pass: false, score: 0, signals: [reason],
    });
    return {
      compliant: false, overallScore: 0,
      checks: {
        whiteBg: fail('buffer_missing_or_too_small'),
        textLogo: fail('buffer_missing_or_too_small'),
        objectComposition: fail('buffer_missing_or_too_small'),
        overExposure: fail('buffer_missing_or_too_small'),
        sharpness: fail('buffer_missing_or_too_small'),
        multiProduct: fail('buffer_missing_or_too_small'),
      },
      rejectionReasons: ['buffer_missing_or_too_small'],
    };
  }

  // Decode to RGB + greyscale at analysis resolution
  const { data: rgb, info } = await sharp(imageBuffer)
    .rotate()
    .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: 'cover', position: 'centre' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;

  // Build greyscale
  const gray = Buffer.allocUnsafe(w * h);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j++) {
    gray[j] = Math.round(0.2126 * rgb[i]! + 0.7152 * rgb[i + 1]! + 0.0722 * rgb[i + 2]!);
  }

  // Build gradient maps (shared by multiple checks)
  const { gx, gy } = buildGradients(gray, w, h);

  // Run all checks
  const whiteBg = checkWhiteBackground(rgb, w, h);
  const textLogo = checkTextLogo(gray, w, h, gx, gy);
  const objectComposition = checkObjectComposition(rgb, gray, w, h);
  const overExposure = checkOverExposure(rgb, gray, w, h);
  const sharpness = checkSharpness(gray, w, h);
  const multiProduct = checkMultiProduct(rgb, gray, w, h);

  // Weighted overall score
  const overallScore = Math.round(
    whiteBg.score * 0.30 +
    textLogo.score * 0.25 +
    objectComposition.score * 0.20 +
    overExposure.score * 0.10 +
    sharpness.score * 0.10 +
    multiProduct.score * 0.05
  );

  const compliant =
    whiteBg.pass &&
    textLogo.pass &&
    objectComposition.pass &&
    overExposure.pass &&
    sharpness.pass &&
    multiProduct.pass &&
    overallScore >= PASS_THRESHOLD;

  const rejectionReasons = [
    ...whiteBg.signals,
    ...textLogo.signals,
    ...objectComposition.signals,
    ...overExposure.signals,
    ...sharpness.signals,
    ...multiProduct.signals,
  ];

  return {
    compliant, overallScore,
    checks: { whiteBg, textLogo, objectComposition, overExposure, sharpness, multiProduct },
    rejectionReasons,
  };
}

/**
 * Convenience wrapper: returns only pass/fail + rejection reasons.
 */
export async function isCoverCompliantV2(
  imageBuffer: Buffer
): Promise<{ compliant: boolean; score: number; reasons: string[] }> {
  const report = await evaluatePortadaComplianceV2(imageBuffer);
  return { compliant: report.compliant, score: report.overallScore, reasons: report.rejectionReasons };
}
