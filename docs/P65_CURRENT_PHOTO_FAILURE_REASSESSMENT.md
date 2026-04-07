# P65 — Current photo failure reassessment

**Listing:** `MLC3786354420` — **Product:** `32690`

## Operator-reported seller UI (active truth)

- **“Detectamos errores en tus fotos”**
- **“Tienes fotos por revisar”**

These are **not** available via our authenticated `items` snapshot (`MLItemSnapshot` has no moderation text). They are treated as **ground truth** for this sprint.

## Prior pack trajectory (context)

| Sprint | What changed | Likely ML perception |
|--------|----------------|----------------------|
| Earlier | Self-hosted **SVG** renders for `wall_cable_organizer` family | **Synthetic / illustrative** — high risk for photo-quality review |
| P64 | Histogram normalize on raster pack | Better **contrast**, same **underlying** synthetic or weak-origin pixels |
| P65 | Replace with **AliExpress supplier JPEG** composited on catalog canvas | **Authentic product photography** trace |

## Code-level finding (fresh evidence)

In `backend/scripts/run-self-hosted-image-provider.ts`, `buildAssetFromSourceImage`:

- For `productFamily === 'wall_cable_organizer'`, the provider returns **`buildOrganizerRenderSvg` → PNG**, **ignoring** the downloaded supplier image.
- That matches **“low-trust / non-catalog”** appearance and aligns with ML holding photos for review while the listing can still oscillate `active` / `under_review`.

## Hypothesis classification (most likely)

**Primary:** `overly_synthetic_illustration_not_catalog_photo` (SVG-based “clean render”) + possible **`weak_protagonsit_composition`** on normalized rasters.

**Secondary:** `insufficient_marketplace_catalog_clarity` — ML expects **real** product surfaces, packaging, or lifestyle cues from **supplier** imagery.

**Not primary:** `blank_near_white_only` after P64 (P64 fixed luminance spread; policy warning can persist for **quality/trust**, not only washout).

## Live API snapshot at replacement (this sprint)

Immediately before `p49` picture replace:

- **`status`:** `under_review`
- **`sub_status`:** `["waiting_for_patch"]`
- **Picture IDs:** `992517-MLC108576529218_032026`, `755547-MLC109381163323_032026` (P64-normalized pack)

So the listing was **again** in a patch/review state while operator still saw seller photo warnings — consistent with **policy layer** not cleared by contrast-only fixes.
