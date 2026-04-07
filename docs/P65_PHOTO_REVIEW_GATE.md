# P65 — Photo review gate (stricter)

## Gate criteria (all required to pass)

| Check | P65 result |
|-------|------------|
| Source is **real supplier** image, not SVG render | **Pass** — AliExpress `ae-pic` URL |
| Dimensions **1536×1536**, square | **Pass** |
| Mean RGB not **near-flat white** (~246, stdev ~7) | **Pass** — mean ~212–218, stdev **37–47** |
| Product **large in frame** (≤1320 inner) | **Pass** — `INNER_MAX` 1320 on 1536 canvas |
| No added text/logos/watermarks in post | **Pass** |
| Genuinely **stronger** than P64-only pack for ML trust | **Pass** — authentic photo + higher file entropy on ML upload |

## Comparative signal (post-upload byte size)

P64-era uploads were on the order of **~70–76 KB** JPEG after ML processing; P65 supplier-based uploads logged **~118 KB** and **~82 KB**, consistent with **richer** photographic content.

## Approval

**Gate decision:** **APPROVED for listing replacement** under P65 scope.

Human ML seller-panel strings were **not** readable by automation; gate is **technical**, not a substitute for MercadoLibre’s internal reviewer UI.
