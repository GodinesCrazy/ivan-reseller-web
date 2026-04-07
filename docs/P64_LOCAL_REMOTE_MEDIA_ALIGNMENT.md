# P64 — Local / remote media alignment

## Canonical local files (post-P64)

| Asset key | File | Role |
|-----------|------|------|
| `cover_main` | `artifacts/ml-image-packs/product-32690/cover_main.png` | Contrasts normalized |
| `detail_mount_interface` | `artifacts/ml-image-packs/product-32690/detail_mount_interface.png` | Contrasts normalized |

Backups: `*.pre_p64_backup`  
Derivatives: `cover_main_p64.png`, `detail_mount_interface_p64.png` (identical bytes to promoted canonicals at promotion time).

## Remote MercadoLibre pictures (post-`p49`)

| Local logical slot | ML picture ID | CDN `-O.jpg` |
|--------------------|---------------|--------------|
| Cover (order 1) | `992517-MLC108576529218_032026` | `D_992517-MLC108576529218_032026-O.jpg` |
| Detail (order 2) | `755547-MLC109381163323_032026` | `D_755547-MLC109381163323_032026-O.jpg` |

## Alignment proof

**Mean/stdev** on downloaded **new** CDN JPEGs match **local corrected** PNGs after the same JPEG-style statistics (see `P64_BUYER_FACING_VISUAL_VERIFICATION.md`).

## Manifest

`ml-asset-pack.json` still lists original filenames and approval metadata; **file contents** on disk were upgraded without renaming keys — **`inspectMercadoLibreAssetPack`** continues to resolve `cover_main.png` / `detail_mount_interface.png`.
