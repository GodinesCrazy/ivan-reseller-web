# P64 — Local asset integrity audit

**Pack directory:** `artifacts/ml-image-packs/product-32690`  
**Tooling:** `backend/scripts/p64-audit-pack-images.ts` (sharp metadata + `stats()` + `processBuffer` from `image-pipeline.service.ts`).

## Pre-correction state (from `*.pre_p64_backup` / recorded before overwrite)

The following values were captured **before** replacing canonical `cover_main.png` / `detail_mount_interface.png` (see execution report / audit run in sprint):

| File | WxH | `hasAlpha` | Mean RGB | RGB stdev | After pipeline mean | After pipeline stdev |
|------|-----|------------|----------|-----------|---------------------|----------------------|
| `cover_main.png` | 1536×1536 | **true** | **~246.25** | **~7.25** | ~246.31 | ~7.28 |
| `detail_mount_interface.png` | 1536×1536 | **true** | **~246.24** | **~6.88** | ~246.20 | ~6.97 |

**Classification (required assets):**

- **`visually_too_faint`** — mean RGB ~246 with stdev ~7 → **no usable contrast** for a product hero on white UI.
- Not **`corrupted`**, **`wrong_asset`**, or **`transparency_problem`** as primary (alpha mean 255 → opaque wash, not “missing alpha flatten”).

`usage_context_clean.png` was **not** in the `p49` upload order (optional / not approved); **unchanged** this sprint.

## Post-correction state (canonical files on disk after P64)

| File | WxH | `hasAlpha` | Mean RGB | RGB stdev |
|------|-----|------------|----------|-----------|
| `cover_main.png` | 1536×1536 | **false** | **202.68** | **41.68** |
| `detail_mount_interface.png` | 1536×1536 | **false** | **199.23** | **41.75** |

**Classification:** **`visually_ok`** for automated contrast metrics (stdev **~42** vs **~7**).

## ML policy notes

- Still **no text / logos / watermarks** introduced (pixel operations only).
- Composition unchanged (same scene, histogram stretched / saturation nudge).
