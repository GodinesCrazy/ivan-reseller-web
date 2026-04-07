# ML Image Compliance Pipeline V2

> Version: 2.0 | Date: 2026-04-02 | Replaces: ad-hoc blanqueamiento heuristics

---

## Overview

The V2 compliance pipeline ensures every cover image submitted to Mercado Libre Chile passes the platform's actual automated moderation checks (`white_background`, `logo_text_watermark`, `blur`, `multiproduct`, `unprofessional_photo`) before publication.

The key architectural principle: **an image is not compliant because it is "more white". An image is compliant when it has a demonstrably pure white background AND a clearly visible, centred, unobstructed product.**

---

## Pipeline Architecture

```
Raw supplier image URLs (AliExpress)
             │
             ▼
    ┌─────────────────────┐
    │  Image Policy Audit │  auditMercadoLibreChileImagePolicy()
    │  (URL heuristics,   │  → detects obvious hard blockers
    │   dimension check)  │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │  Decision Engine    │  evaluateMercadoLibreImageRemediationDecision()
    └──────────┬──────────┘
               │
    ┌──────────┴─────────────────────────────────┐
    │  autoGenerateSimpleProcessedPack()         │
    │                                            │
    │  ┌─────────────────────────────────────┐  │
    │  │ PHASE 1: Isolation + White Canvas   │  │
    │  │                                     │  │
    │  │  For each source image:             │  │
    │  │    isolateProductSubjectToPng()     │  │
    │  │    ↓ (RGBA cutout)                  │  │
    │  │    composePortadaHeroWithRecipe()   │  │
    │  │    (p107_white_078: 78% fill,       │  │
    │  │     pure white 1200×1200 canvas)    │  │
    │  │    ↓                                │  │
    │  │    Quality Gate:                    │  │
    │  │      reject if >95% near-white      │  │
    │  │      reject if >5% warm-gray bleed  │  │
    │  │    ↓ (first pass = DONE ✓)          │  │
    │  └─────────────────────────────────────┘  │
    │             │ all fail                     │
    │             ▼                              │
    │  ┌─────────────────────────────────────┐  │
    │  │ PHASE 2: Soft BG Neutralization     │  │
    │  │         (WHITE — not gray)          │  │
    │  │                                     │  │
    │  │  For each source image:             │  │
    │  │    Detect background colour         │  │
    │  │    Replace near-bg pixels → #FFF    │  │
    │  │    Blend transition pixels → #FFF   │  │
    │  │    Quality Gate:                    │  │
    │  │      reject if >95% near-white      │  │
    │  │    Compose on white 1200×1200       │  │
    │  │    Pick best (most visible product) │  │
    │  └─────────────────────────────────────┘  │
    │             │ all fail                     │
    │             ▼                              │
    │  ┌─────────────────────────────────────┐  │
    │  │ PHASE 3: Absolute Fallback          │  │
    │  │                                     │  │
    │  │  flatten(#fff) + resize + extend    │  │
    │  │  on white canvas                    │  │
    │  │  (last resort — may preserve        │  │
    │  │   non-white source bg)              │  │
    │  └─────────────────────────────────────┘  │
    └──────────────────────────────────────────-┘
               │
               ▼
    ┌─────────────────────────────────────────────┐
    │  Compliance Validation (New in V2)          │
    │                                             │
    │  evaluatePortadaComplianceV2()              │
    │  ├── checkWhiteBackground()                 │
    │  ├── checkTextLogo()                        │
    │  ├── checkObjectComposition()               │
    │  ├── checkOverExposure()                    │
    │  ├── checkSharpness()                       │
    │  └── checkMultiProduct()                    │
    │                                             │
    │  → compliance score 0–100                   │
    │  → pass threshold: 75                       │
    └─────────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────┐
    │  Asset Pack Manifest                        │
    │  → phase label in notes field               │
    │  → bg=white_255 recorded                    │
    │  → portadaGateBypass: true (isolation path) │
    └─────────────────────────────────────────────┘
```

---

## Key Functions

### C.6 — Public API Functions

| Function | File | Purpose |
|---|---|---|
| `autoGenerateSimpleProcessedPack()` | `mercadolibre-image-remediation.service.ts` | Main cover generation (3 phases) |
| `attemptMercadoLibreP103HeroPortadaFromUrls()` | `ml-portada-hero-reconstruction.service.ts` | Advanced autonomous hero reconstruction |
| `evaluatePortadaComplianceV2()` | `ml-portada-compliance-v2.service.ts` | Comprehensive compliance report |
| `isCoverCompliantV2()` | `ml-portada-compliance-v2.service.ts` | Convenience pass/fail wrapper |
| `evaluateMlPortadaStrictAndNaturalGateFromBuffer()` | `ml-portada-visual-compliance.service.ts` | Legacy structural + white-bg gates |
| `isolateProductSubjectToPngWithVariant()` | `ml-portada-isolation.service.ts` | Border-statistics segmentation |
| `composePortadaHeroWithRecipe()` | `ml-portada-recipes.service.ts` | Compose cutout on white canvas |

---

## Phase 1: Isolation + White Canvas

### Segmentation Variants (P109)

| Variant ID | Border Band | Threshold Mult | Post-CC Dilate | Alpha Blur |
|---|---|---|---|---|
| `p103_v1_default` | 2% | 3.05 | 1 | 1.05σ |
| `p109_border_relaxed` | 4.2% | 2.68 | 1 | 1.15σ |
| `p109_mask_minimal_spread` | 2% | 3.05 | 0 | 1.05σ |
| `p109_soft_alpha_blur` | 2% | 3.05 | 1 | 1.55σ |

The isolation algorithm:
1. Samples border pixels to compute background mean RGB.
2. Classifies foreground (product) as pixels with Euclidean distance from background mean > threshold.
3. Runs binary erode/dilate morphology to clean the mask.
4. Selects largest connected component.
5. Applies soft alpha blur to feather the product silhouette.

### Composition Recipes

| Recipe ID | Canvas BG | Product Fill |
|---|---|---|
| `p107_white_078` | #FFFFFF | 78% |
| `p107_white_072` | #FFFFFF | 72% |
| `p107_white_076` | #FFFFFF | 76% |
| `p107_white_085` | #FFFFFF | 85% |
| `p107_neutral_f9_078` | #F9F9F8 | 78% |
| `p107_light_gray_f6_078` | #F6F6F6 | 78% |

**Note:** The simple pack uses only `p107_white_078`. The hero reconstruction path tries all recipes in order.

---

## Phase 2: Soft Background Neutralization (V2 Fix)

**Critical change from V1:** Background replacement colour changed from `SOFT_GRAY=220` (#DCDCDC) to `SOFT_WHITE=255` (#FFFFFF).

**Why this matters:**
- #DCDCDC has pure-white channel values of 0% → fails `WHITE_PURE_DOMINANCE_MIN = 0.40`
- #FFFFFF achieves 100% pure-white in replaced background pixels
- ML's `white_background` check requires pure digitally-created white; gray backgrounds reliably trigger "No tiene fondo blanco"

**Algorithm:**
```
For each pixel (r, g, b):
  d = distance((r,g,b), bgMean)
  if d <= 30:       → pixel[i] = 255 (pure white — background zone)
  elif d < 80:      → pixel[i] = blend(255, original, gradient)
  else:             → pixel[i] = original (product zone, untouched)
```

Quality gate (added in V2): If resulting composition is >95% near-white, the product is invisible — skip this candidate and try next source image.

---

## V2 Compliance Check Weights

| Check | Weight | What triggers failure |
|---|---|---|
| White background | 30% | Gray, coloured, or non-uniform background |
| Text / logo | 25% | Overlay text, banners, logos, stickers |
| Object composition | 20% | Too small, too large, off-centre, cropped |
| Over-exposure | 10% | Product washed out on white canvas |
| Sharpness | 10% | Blurry / out-of-focus |
| Multi-product | 5% | Multiple product units visible |

**Pass threshold:** Overall score ≥ 75 AND all individual checks pass.

---

## What Was NOT Changed

- The isolation algorithm itself (border statistics + morphology) — it is architecturally correct.
- The hero reconstruction path (P103/P108/P109) — it already uses pure white recipes.
- The manifest structure and `portadaGateBypass` mechanism — the bypass is valid for Phase 1 isolation outputs which are demonstrably clean.
- The canonical P76 pipeline — it correctly uses pure white already.
- Any other service not related to image generation.
