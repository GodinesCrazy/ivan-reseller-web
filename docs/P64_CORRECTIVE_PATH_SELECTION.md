# P64 — Corrective path selection

## Options considered

| Path | Verdict |
|------|---------|
| Re-upload **same** files | **Rejected** — CDN stats proved they stay **near-white**; no ML-side fix. |
| Change **only** `image-pipeline.service.ts` globally | **Rejected for this sprint** — would affect all listings; user required **listing-scoped** correction. |
| **Regenerate** from image model | **Deferred** — higher latency/cost; not needed once histogram issue confirmed fixable in post. |
| **Local re-export** with contrast normalization | **Selected** — minimum change, deterministic, reversible (backups kept). |

## Chosen minimum fix

**Listing-scoped raster correction** on the two **approved required** PNGs:

1. `flatten` onto light neutral `#f5f5f5` (remove alpha edge cases for future pipelines).
2. **`normalize()`** — stretch luminance to use dynamic range.
3. **`modulate({ saturation: 1.25, brightness: 0.98 })`** — slightly richer color without clipping highlights.

Output **PNG** at 1536×1536, then **promote** to canonical `cover_main.png` and `detail_mount_interface.png` (originals saved as `*.pre_p64_backup`).

## Why this is the smallest correct fix

- Targets the **measured** defect (mean ~246, stdev ~7).
- Preserves **p49** / `inspectMercadoLibreAssetPack` contract (same filenames, same approval metadata on disk).
- Does not touch other products or listing records except via **`p49`** picture replace for **`MLC3786354420`**.

**Script:** `backend/scripts/p64-build-contrast-fixed-pngs.ts` (writes `*_p64.png` then operator copied to canonical names in this sprint).
