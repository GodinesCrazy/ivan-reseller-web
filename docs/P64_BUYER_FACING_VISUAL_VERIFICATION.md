# P64 — Buyer-facing visual verification

## What automation can prove

This sprint **did not** capture a human screenshot or headed-browser render of the PDP.

It **did** verify that MercadoLibre’s CDN now serves JPEGs whose **global contrast** matches the corrected pack (not the washed prior generation).

### CDN luminance stats (`p64-stats-remote-jpeg.ts`)

| Source | Bytes | Mean RGB | RGB stdev |
|--------|-------|----------|-----------|
| **New** `992517-…-O.jpg` | 25 671 | 202.68 | **40.52** |
| **New** `755547-…-O.jpg` | 26 929 | 199.40 | **40.54** |
| **Old** `777356-…-O.jpg` | 17 860 | 246.29 | **7.35** |
| **Old** `984076-…-O.jpg` | 17 484 | 246.81 | **7.12** |

The **new** IDs align numerically with **post-correction local** means/stdev (~200 / ~42), proving ML is distributing the **tonally corrected** rasters.

## Classification

**`buyer_visible_images_ok` — proxy verified (CDN contrast restored)**

- Thumbnails / zoom tiles should inherit the same assets ML hosts for these IDs.
- **Human eye confirmation** on `articulo.mercadolibre.cl` is still the **final** gate for “looks right,” but the **specific** failure mode (**blank / washed** due to **flat near-white** source) is **addressed with measurable proof**.

Not applicable: **`images_still_blank`**, **`blocked_by_ml_rendering`** (for this contrast defect).

If a human still dislikes composition, classify separately as **creative / regeneration**, not P64’s measured defect.
