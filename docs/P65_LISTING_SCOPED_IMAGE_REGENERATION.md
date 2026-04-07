# P65 — Listing-scoped image regeneration

## Command

```text
cd backend
npx tsx scripts/p65-build-supplier-catalog-pack.ts 32690
```

## Implementation

**Script:** `backend/scripts/p65-build-supplier-catalog-pack.ts`

- Loads **`products.images`** JSON for **32690** from Postgres.
- Downloads **AliExpress CDN** primary URL (and secondary when present).
- Builds **`cover_main.png`** and **`detail_mount_interface.png`** per `docs/P65_STRONGER_ML_PHOTO_SPEC.md`.
- Backs up prior canonical files as **`cover_main.pre_p65_backup_<timestamp>.png`** (and same for detail).

## Run output (this sprint)

```json
{
  "productId": 32690,
  "title": "Soporte organizador de enchufes montado en la pared, estante de gestión de cable",
  "supplierUrlsUsed": [
    "https://ae-pic-a1.aliexpress-media.com/kf/Sd63839aaf0834ce88fe4e594b8e2f590M.jpg"
  ],
  "strategy": "real_supplier_photo_catalog_canvas_not_svg",
  "coverMeanRgb": 212.33,
  "coverStdevRgb": 47.48,
  "detailMeanRgb": 217.59,
  "detailStdevRgb": 37.67
}
```

**Note:** Only **one** supplier URL was present in DB; detail image uses **center-zoom** on the same source.

## Difference vs P64

- P64: **histogram / saturation** on existing pack rasters.
- P65: **new pixel origin** = **supplier JPEG**, avoiding self-hosted **SVG** path that the repo uses for `wall_cable_organizer` prompts.
