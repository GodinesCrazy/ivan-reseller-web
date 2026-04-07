# P108 — P107 failure pattern analysis

## Source

- **`p107-benchmark-32714.json`** — six recipes × raw cutout only (no P108 waves).
- **`p108-benchmark-32714.json`** — same seven URLs with **five** recovery waves × six recipes (aggregated counts).

## Dominant strict+natural signals (P108 aggregate, all variants)

From **`dominantStrictNaturalSignalsAcrossAllVariants`** in `p108-benchmark-32714.json` (counts in parentheses):

| Signal | Count (approx.) | Likely recoverable by… |
|--------|------------------|-------------------------|
| `portada_natural_look_harsh_silhouette_vs_white_field_sticker_or_cutout_risk` | 173 | Alpha feather / softer edges (P108 target). |
| `portada_white_background_insufficient_near_white_dominance` | 114 | Different canvas tone or cleaner subject separation (partially recipe; partially source). |
| `portada_high_local_contrast_fragmentation_sticker_collage_risk` | 92 | Harder — multi-object / collage-like **source** frames. |
| `portada_white_background_insufficient_true_white_pixels` | 78 | Scale/margin recipes + background tone. |
| `portada_white_background_border_shadow_or_object_bleed` | 31 | Erode/halos (P108 erode wave). |
| `portada_white_background_border_non_uniform` | 28 | Segmentation + edge treatment. |
| `portada_white_background_corner_not_white_enough` | 27 | Composition / residual subject bleed. |
| `portada_vertical_split_seam_collage_risk` | 24 | **Source** layout (two-pane imagery). |

## Interpretation

- **Sticker / harsh silhouette** and **white-field** issues dominate — consistent with **cutout + flat catalog** look on AliExpress packshots.
- **Collage / vertical split / fragmentation** signals point to **content** in the supplier JPEGs that **alpha-only recovery cannot remove** without inpainting or a different segmenter.
- P108 **did** attack the first cluster (feather, erode, dilate) but **benchmark still failed** → remaining failures are a mix of **engine limit** and **true source insufficiency**.
