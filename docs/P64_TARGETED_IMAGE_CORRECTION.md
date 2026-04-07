# P64 — Targeted image correction

## Inputs

- `artifacts/ml-image-packs/product-32690/cover_main.png` (pre-correction)
- `artifacts/ml-image-packs/product-32690/detail_mount_interface.png` (pre-correction)

## Backups created

- `cover_main.png.pre_p64_backup`
- `detail_mount_interface.png.pre_p64_backup`

## Processing

Sharp pipeline (see `backend/scripts/p64-build-contrast-fixed-pngs.ts`):

```text
flatten({ background: #f5f5f5 })
  → normalize()
  → modulate({ saturation: 1.25, brightness: 0.98 })
  → png()
```

Intermediate files `cover_main_p64.png` and `detail_mount_interface_p64.png` were written, then **copied over** the canonical filenames expected by `findAssetFile()`.

## Measured improvement (local)

| Metric | Before (approx) | After |
|--------|-----------------|-------|
| RGB stdev | ~7 | **~42** |
| Mean RGB | ~246 | **~200** |
| Alpha | Opaque wash | **Removed** (`hasAlpha: false` post-export) |

## Scope

- **Only** product **32690** pack files for the two required approved assets.
- **`usage_context_clean.png`** untouched.
