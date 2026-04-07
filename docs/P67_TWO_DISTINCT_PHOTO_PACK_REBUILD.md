# P67 — Two-distinct photo pack rebuild

**Product:** `32690` · **Pack directory:** `artifacts/ml-image-packs/product-32690/`

## Prerequisite

At least **two** supplier image URLs in `products.images` whose **normalized** URLs differ (query-stripped comparison). The rebuild script was updated in P67 to pick the **first norm-distinct** URL after index `0`.

## P67 status

**Not executed** in this sprint after enrichment: the database still has **one** real supplier URL, so a rebuild would only repeat **`single_supplier_url_cover_plus_distinct_zoom_detail`** (derivative detail) — explicitly **out of scope** as the intended final strategy per P67 mission when a real second angle is technically obtainable.

**Honest state:** **`still_single_image_only`** (credential block prevented discovering more URLs).

## Command (when ≥2 norm-distinct URLs exist)

```bash
cd backend
npx tsx scripts/p66-rebuild-supplier-catalog-pack.ts 32690
```

Expected JSON field when successful: **`strategy`: `two_distinct_supplier_full_frame_catalog`**.

After rebuild, run visual approval and listing replacement per `docs/P67_LISTING_PHOTO_REPLACEMENT.md`.
