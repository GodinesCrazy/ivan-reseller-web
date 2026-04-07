# P109 — Advanced autonomous recovery V2 engine

## Goals

- Move **beyond P108 alpha-only waves** with a **reusable** matrix: segmentation variants × studio prep × P108 recovery × P107 recipes.
- Preserve **fail-closed** behavior: no silent publish without gate pass.
- **No** reliance on manual supplement heroes for the benchmark path.
- **No** pricing or credential changes in this track.

## Engine version

`attemptMercadoLibreP103HeroPortadaFromUrls` exposes trace field **`recoveryEngineVersion`**:

| Value | Meaning |
|--------|---------|
| `p109_autonomous_v2` | P109 enabled (`ML_P109_V2` not `0`/`false`): multi segmentation + studio prep order + P108 + P107 |
| `p108_alpha_waves` | P109 off, P108 advanced recovery on |
| `p107_compose_only` | Neither P109 multi-path nor P108 waves |

## Components (code)

1. **`ml-portada-isolation.service.ts`**  
   - `PortadaSegmentationVariantId`: `p103_v1_default`, `p109_border_relaxed`, `p109_mask_minimal_spread`, `p109_soft_alpha_blur`.  
   - `isolateProductSubjectToPngWithVariant`, `resolveSegmentationVariantOrder`, `DEFAULT_P109_SEGMENTATION_ORDER`.  
   - Global toggle: **`ML_P109_V2`** (default on unless `0` or `false`).

2. **`ml-portada-studio-prep-p109.service.ts`**  
   - `P109StudioPrepId`: `p109_none`, `p109_halo_light`, `p109_halo_medium`.  
   - Local RGB pull toward white on **mid-alpha** fringe pixels (sharp pipeline only; **no external generative inpainting** in this sprint).

3. **`ml-portada-hero-reconstruction.service.ts`**  
   - Per ranked source, nested order: **segmentation** → **studio prep** → **P108 recovery profile** → **P107 recipe** → existing **strict gates**.  
   - Trace: `segmentationVariantsAttempted`, `studioPrepIdsAttempted`, per-trial `segmentationVariantId`, `studioPrepId`, `recoveryProfileId`.  
   - On full exhaustion (P109-shaped attempt, no supplement fail-closed): **`AUTONOMOUS_V2_RECOVERY_EXHAUSTED`**.

## What V2 is not (yet)

- Full **inpainting / background outpainting** (diffusion or cloud fill) is **not** wired here; that would be a follow-on with the same gate stack and trace hooks.

## Remediation manifest

`mercadolibre-image-remediation.service.ts` notes line includes **`seg=`** and **`studio=`** winner ids when present.
