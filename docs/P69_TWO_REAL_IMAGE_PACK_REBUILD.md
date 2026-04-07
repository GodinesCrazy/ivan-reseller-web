# P69 — Two-real-image pack rebuild

**Product:** `32690` · **Pack dir:** `artifacts/ml-image-packs/product-32690/`

## Command

```bash
cd backend
npx tsx scripts/p66-rebuild-supplier-catalog-pack.ts 32690
```

## Selection logic (P69 correction)

An first rebuild attempt matched **two URLs with different hosts** but the **same AliExpress `/kf/S…` object id** (`Sd63839…`), producing **`identicalCoverDetail: true`** (same raster — unsuitable as a “second angle”).

**Fix applied in-repo:** `p66-rebuild-supplier-catalog-pack.ts` now picks the detail URL using **`extractAeImageObjectKey`** so the second slot is the first list entry whose **`/kf/S{id}`** differs from the cover’s id (fallback: normalized URL if keys missing).

The script also imports **`../src/config/env`** (same bootstrap pattern as P68 enrichment).

## Verified output (final run)

| Field | Value |
|--------|--------|
| `strategy` | **`two_distinct_supplier_full_frame_catalog`** |
| `identicalCoverDetail` | **`false`** |
| **Cover (slot 1)** | `https://ae-pic-a1.aliexpress-media.com/kf/Sd63839aaf0834ce88fe4e594b8e2f590M.jpg` |
| **Detail (slot 2)** | `https://ae01.alicdn.com/kf/Scdf80a1900764667b3e4c3b600f79325U.jpg` |

Stats: `coverMeanRgb` 212.19 / `detailMeanRgb` 202.64 — visually distinct processing confirms non-identical buffers.

## Backups

Prior PNGs were copied to `cover_main.pre_p66_backup_*` / `detail_mount_interface.pre_p66_backup_*` under the pack directory per script behavior.
