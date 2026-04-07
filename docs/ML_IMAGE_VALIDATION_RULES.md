# ML Image Validation Rules

> Reference: ml-portada-compliance-v2.service.ts | Version: 2.0 | Date: 2026-04-02

---

## Overview

Two validator layers exist:

1. **V1 Gates** (`ml-portada-visual-compliance.service.ts`) — structural heuristics, white background gate, natural look gate. Used in `inspectAsset()` unless `portadaGateBypass: true`.

2. **V2 Compliance Validator** (`ml-portada-compliance-v2.service.ts`) — comprehensive 6-check validator with per-check scores and overall compliance score. Aligned with ML's actual automated moderation checks.

---

## V1 Gates (Legacy — still active)

### Gate 1: Structural (Text/Promo/Collage)

**Function:** `analyzePortadaGreyscale()`
**Analysis size:** 480×480px greyscale

| Signal | Threshold | ML Equivalent |
|---|---|---|
| Top band edge ratio | ≥ 1.72 (hard) or ≥ 1.38 (soft, fail-closed) | `logo_text_watermark` |
| Bottom band edge ratio | ≥ 1.62 (hard) or ≥ 1.32 (soft) | `logo_text_watermark` |
| Side band edge ratio | ≥ 1.68 (hard) or ≥ 1.34 (soft) | `logo_text_watermark` |
| Top horizontal stroke density | ≥ 20% of rows with mean stroke ≥ 10 | `logo_text_watermark` |
| High-contrast block fragmentation | ≥ 40% of 10×10 grid blocks with StdDev ≥ 32 | `unprofessional_photo` |
| Frame-to-core edge ratio | ≥ 1.52 | `unprofessional_photo` (UI/banner) |
| Vertical seam collage | seam ratio ≥ 2.35 AND seam energy ≥ 28 AND fragmentation ≥ 30% | collage detection |

### Gate 2: White Background (P102)

**Function:** `analyzeWhiteBackgroundRgb()`
**Analysis size:** 480×480px RGB

| Parameter | Threshold (updated 2026-04-02) | Signal on failure |
|---|---|---|
| Near-white pixel dominance (≥245 all channels) | **≥ 62%** (was 58%) | `portada_white_background_insufficient_near_white_dominance` |
| Pure-white pixel dominance (≥252 all channels) | **≥ 40%** (was 28%) | `portada_white_background_insufficient_true_white_pixels` |
| Border near-white ratio | ≥ 90% | `portada_white_background_border_not_white_enough` |
| Corner near-white ratio | ≥ 93% | `portada_white_background_corner_not_white_enough` |
| Border mean luma | ≥ 246 | `portada_white_background_border_gray_cast` |
| Border luma std dev | ≤ 13 | `portada_white_background_border_non_uniform` |
| Border dark pixel ratio (luma < 220) | ≤ 1% | `portada_white_background_border_shadow_or_object_bleed` |

**Calibration note:** Gray #DCDCDC (220,220,220) → luma = 220 per channel, pure-white = 0%, near-white = 0% → fails both dominance checks definitively. This is the intended behaviour after the 2026-04-02 fix.

### Gate 3: Natural Look (Anti-Sticker/Cutout, P103)

**Function:** `analyzeNaturalLookGreyRgb()`

| Signal | Threshold | Description |
|---|---|---|
| Subject interior std dev | ≥ 2.55 | Flat interiors = sticker/cutout |
| Subject extent | 6%–90% of canvas | Too small or too large = composition issue |
| Boundary-to-white-field grad ratio | ≤ 118 | Harsh silhouette vs soft white field |
| Fringe chroma ratio | ≤ 4.2% | Coloured halo in border band |

---

## V2 Compliance Validator (New)

**File:** `ml-portada-compliance-v2.service.ts`
**Function:** `evaluatePortadaComplianceV2(buffer) → PortadaComplianceV2Report`
**Analysis size:** 480×480px
**Pass threshold:** Overall score ≥ 75 AND all 6 individual checks pass.

---

### Check D.1: White Background (`checkWhiteBackground`)

**Weight:** 30% of overall score

| Parameter | Threshold | Failure Signal |
|---|---|---|
| Near-white dominance (≥245 all channels) | ≥ 62% | `white_bg_near_dominance_XX.Xpct_below_62pct` |
| Pure-white dominance (≥252 all channels) | ≥ 40% | `white_bg_pure_dominance_XX.Xpct_below_40pct` |
| Border near-white ratio | ≥ 90% | `white_bg_border_XX.Xpct_not_white` |
| Corner near-white ratio | ≥ 93% | `white_bg_corner_XX.Xpct_not_white` |
| Border mean luma | ≥ 246 | `white_bg_border_luma_XXX_gray_cast` |
| Border luma std dev | ≤ 13 | `white_bg_border_luma_std_X.X_non_uniform` |

**Practical values for common backgrounds:**

| Background | Near-white % | Pure-white % | Result |
|---|---|---|---|
| Pure white (#FFFFFF) + dark product 65% fill | ~55–70% | ~50–65% | ✅ Pass |
| Gray (#DCDCDC = 220,220,220) | ~0% | ~0% | ❌ Fail |
| Near-white (#F0F0F0 = 240,240,240) | ~70–90%+ | ~0–5% | ❌ Fail (pure-white) |
| Off-white (#F9F9F8 = 249,249,248) | ~80%+ | ~60–80% | ✅ Marginal pass |

---

### Check D.2: Text / Logo (`checkTextLogo`)

**Weight:** 25% of overall score

| Signal | Threshold | ML Equivalent |
|---|---|---|
| Top band edge ratio | ≥ 1.72 | `logo_text_watermark` |
| Bottom band edge ratio | ≥ 1.62 | `logo_text_watermark` |
| Left/Right sidebar edge ratio | ≥ 1.68 | `logo_text_watermark` |
| Top horizontal stroke density | ≥ 20% busy rows | `logo_text_watermark` (text detection) |
| High-contrast block fragmentation | ≥ 40% | `unprofessional_photo` (sticker/collage) |

**Limitation:** This is heuristic-based (gradient energy analysis), not OCR. It reliably detects banners, sticker grids, and dense text layouts. It may miss a single small watermark or a product with a printed label. For products where text is integral (e.g., a book cover, printed T-shirt), test behaviour is expected to be acceptable.

---

### Check D.3: Object Composition (`checkObjectComposition`)

**Weight:** 20% of overall score

| Parameter | Threshold | Failure Signal |
|---|---|---|
| Subject area ratio | 35%–91% | `composition_subject_area_*_product_too_small` or `_no_margin` |
| Subject bbox width ratio | ≥ 30% | `composition_bbox_width_*_too_narrow` |
| Subject bbox height ratio | ≥ 30% | `composition_bbox_height_*_too_short` |
| Centre offset (x or y) | ≤ 20% from canvas centre | `composition_centre_offset_*_not_centred` |
| Product touching edge | Subject pixels within 2px of boundary | `composition_product_touches_or_crops_at_edge` |

**How subject is defined:** Any pixel with luma < 245 OR chroma (max–min channel) > 13 is considered product/subject. Pure-white and near-white pixels are considered background.

---

### Check D.4: Over-Exposure (`checkOverExposure`)

**Weight:** 10% of overall score

| Parameter | Threshold | Failure Signal |
|---|---|---|
| Product pixel near-white fraction | ≤ 92% | `over_exposure_product_XX.Xpct_near_white_washed_out` |
| Minimum subject pixels detected | ≥ 200 | `over_exposure_insufficient_subject_pixels_detected` |

**Purpose:** Catches images where the product is a very light colour (e.g., white product on white background) and is effectively invisible.

---

### Check D.5: Sharpness (`checkSharpness`)

**Weight:** 10% of overall score

| Parameter | Threshold | Failure Signal |
|---|---|---|
| Laplacian variance (greyscale) | ≥ 80 | `sharpness_laplacian_variance_XX.X_below_80_image_blurry` |

**Method:** 5-pixel Laplacian kernel applied to greyscale. Variance of Laplacian values across the image. Sharp images have high variance (strong edges); blurry images have low variance.

**Typical values:** Sharp JPEG at 1200px: 150–800+. Moderately blurry: 40–80. Heavily blurry: < 20.

---

### Check D.6: Multi-Product (`checkMultiProduct`)

**Weight:** 5% of overall score

| Signal | Threshold | Failure Signal |
|---|---|---|
| Vertical separating gaps in subject | ≥ 2 gaps of ≥ 7% width | `multi_product_N_vertical_separating_gaps` |
| Horizontal separating gaps in subject | ≥ 2 gaps of ≥ 7% height | `multi_product_N_horizontal_separating_gaps` |

**Method:** Builds column and row presence maps from subject mask. Detects white "separating gaps" ≥ 7% of canvas width/height that fully divide the subject. Two such gaps indicate at least 3 distinct product regions.

---

## Compliance Score Formula

```
overallScore =
  whiteBg.score      × 0.30  +
  textLogo.score     × 0.25  +
  composition.score  × 0.20  +
  overExposure.score × 0.10  +
  sharpness.score    × 0.10  +
  multiProduct.score × 0.05
```

A cover is **compliant** when:
- `compliant = true` (all checks pass AND overallScore ≥ 75)

---

## Rejection Decision Tree

```
Is background white (near-white ≥62%, pure-white ≥40%)?
  └── NO  → REJECT: white_bg failure (30% score hit, likely fatal to overall score)
  └── YES → continue

Is there text/logo/overlay?
  └── YES → REJECT: text_logo failure
  └── NO  → continue

Is product area 35–91% of canvas?
  └── NO  → REJECT: composition failure
  └── YES → continue

Is product within 20% of centre?
  └── NO  → REJECT: composition failure
  └── YES → continue

Is product visible (not >92% near-white)?
  └── NO  → REJECT: over_exposure failure
  └── YES → continue

Is image sharp (Laplacian variance ≥ 80)?
  └── NO  → REJECT: sharpness failure
  └── YES → ACCEPT (if overall score ≥ 75)
```
