# P75 — Seller-proof cover strategy

## Minimum strategy chosen

**Listing-scoped annotation-band removal (fractional insets) + plain white field + gentle tonal catalog treatment + neutral background cleanup** — implemented without new npm dependencies (Sharp only).

Ruled out for this sprint (not in repo / not safely automatable without new infra):

- **True inpainting** of text printed on the product body (would need segmentation + generative infill).
- **Third-party background-removal APIs** (no configured key / not added to `package.json`).

## Why not “another center crop only”

P74 already maximized generic center-crop. The **offending pixels** (dimensions + bottom callout) **overlap the same crop window** as the product; only **asymmetric removal** of top/left/bottom strips fixes texto without inventing pixels.

## Why not switch supplier image (default)

The same **real** hero (`s2eee0bfe…`) remains the **truth** source; it is the highest-ranked real frame in P74 scoring. Alternate keys (e.g. `sd8adf…`) were kept as **CLI override** (`--object-key=`) if future evidence shows a cleaner native photo without overlays.

## Alignment to seller reasons

| Reason | Strategy |
|--------|----------|
| Logos/text | Remove **known overlay bands** via calibrated insets; no OCR. |
| Fondo claro / sin textura | **Pure white** 1536×1536 canvas + **neutral chroma crush** on light gray pixels (shadows). |

## Secondary image

**Unchanged:** `detail_mount_interface.png` — no evidence it triggers the portada warning.
