# P79 — Hero / cover quality failure analysis

## Observed problem (post–P78)

SKU **32690** could reach **`remediated_pass`** via **`inset_white_catalog_png`** while the **portada** remained **commercially weak**:

- Product reads as a **narrow / thin** subject on a large white field.
- **Low frame dominance** — excessive **dead space** around the SKU.
- **Low conversion appeal** despite passing **policy + conversion** buffer checks (dimensions, edge lightness, global mean, etc.).

## Why dual gate was insufficient

| Gate | What it approximates | Gap |
|------|----------------------|-----|
| **Policy** | Compliance proxies (fitness, text/logo risk, background simplicity on **candidate**; dimensions/edge on **output**) | Does not measure **subject share of canvas**. |
| **Conversion** | Catalog look, occupancy **scores** (heuristic) | Same scores can miss **inset “postage stamp”** layouts that are still statistically “ok”. |

## Failure dimensions (formalized for P79)

| Dimension | Symptom | P79 treatment |
|-----------|---------|----------------|
| **Subject area vs canvas** | Tiny trim bbox vs full square | **Hard fail** — `minSubjectAreaRatio` |
| **Subject width / height share** | Thin strip or short band | **Hard fail** — `minSubjectWidthRatio`, `minSubjectHeightRatio` |
| **Strip-like composition** | One axis dominates unfairly | **Hard fail** — `minExtentBalance` |
| **Readability / attractiveness** | Subjective | **Advisory via existing conversion scores** (unchanged); not duplicated in hero gate v1 |

## Measurement approach

**Sharp `trim({ threshold })`** on the **same buffer** evaluated for publish: non-background **bounding box** vs full canvas → reproducible **occupancy / dominance** proxies without new ML models.
