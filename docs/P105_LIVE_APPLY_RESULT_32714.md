# P105 — Live apply result (32714)

## Status

**Not executed** in the P105 run that produced **`p105-live-result.json`** (2026-03-27).

**Reason:** P103 rebuild **did not succeed** (`p103AttemptOk: false`). The script exits before writing **`cover_main.png`** or calling **`--try-replace-ml`**.

## Intended live path (when rebuild succeeds)

1. Write **`artifacts/ml-image-packs/product-32714/cover_main.png`** from the winning buffer.
2. Update **`ml-asset-pack.json`** so **`cover_main`** has **`assetSource: p105_portada_supplement_hero`** and notes include **`winner_kind`**.
3. If **`--try-replace-ml MLC3805190796`** (or current item id) and credentials exist: **`MercadoLibreService.replaceListingPictures(itemId, [coverPath, detailPath])`** with **`detail_mount_interface.png`** (or `.jpg`) beside the pack.

## ML / listing identifiers (context only)

- **Listing id (DB / P104 snapshot):** `MLC3805190796` (see `p104-persistence-32714.json`).
- **Permalink (example):** `https://articulo.mercadolibre.cl/MLC-3805190796-rotating-table-cell-phone-holder-support-desktop-stand-fo-_JM`

**Items API** was not re-validated in this P105 pass; Seller Center remains source of truth for image policy.

## Exact ML response this sprint

**N/A** — no picture-replace request was sent because the portada rebuild failed closed on the supplement hero path.
