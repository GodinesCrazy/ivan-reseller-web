# P80 — Failure class formalization

## Observed failure (SKU 32690 context)

A remediated cover could reach `remediated_pass` while the **visible** result was commercially useless: **near-uniform white / near-blank** canvas. P79’s hero gate (trim-bbox vs canvas) could still **pass** when trim treated the **entire** canvas as “subject,” so composition metrics looked healthy while pixel content was empty.

## Failure class name

**`near_blank_remediated_cover`**: output buffer is policy/conversion/hero-compliant but **lacks sufficient non-background ink** in pixel space.

## Measurable dimensions

| Dimension | Definition | Gate tier |
|-----------|------------|-----------|
| **near_blank_canvas** | Mean luminance very high and luminance stdev very low (uniform bright field) | **Hard fail** |
| **insufficient_non_background_pixels** | Fraction of pixels with visible signal (luma/chroma heuristics) below minimum | **Hard fail** |
| **excessive_near_white_pixels** | Fraction of pixels with R,G,B ≥ threshold (catalog white) above maximum | **Hard fail** |
| **low_useful_contrast** | Global luminance range (max L − min L) on a fixed downsample below minimum | **Hard fail** |
| **silhouette_too_weak** | Captured indirectly by low luminance range + low signal ratio on downsample (no separate Sobel in v1) | **Hard fail** (proxy) |
| **trim_false_positive_risk** | Hero `subjectAreaRatio` very high **and** pixel signal ratio very low **and** mean luminance high | **Hard fail** (composite) |

## Advisory (not standalone hard fails in P80 v1)

- Per-channel histogram shape, edge-density maps — reserved for future tuning or operator dashboards.
- Full-resolution stats — intentionally avoided for cost; downsampled stats are canonical for the gate.

## Hard vs advisory summary

- **Hard:** all dimensions implemented in `output-integrity-gate.service.ts` as explicit failure strings.
- **Advisory:** richer CV features deferred; trace metrics already support debugging without them.
