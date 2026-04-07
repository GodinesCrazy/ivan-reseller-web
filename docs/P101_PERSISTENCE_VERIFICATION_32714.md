# P101 — Persistence verification (product 32714)

Source: `p101-republish-result.json` after successful publish (`executedAt` ≈ `2026-03-27T02:35:02.502Z`).

## Product row

`productRowAfter`:

| Field | Value |
|-------|--------|
| `id` | `32714` |
| `status` | `PUBLISHED` |
| `isPublished` | `true` |
| `publishedAt` | `2026-03-27T02:35:51.730Z` |
| `images` | Restored to original AliExpress JSON array (seven `https://ae01.alicdn.com/...` URLs) — P101 does not persist local file paths on the product after publish. |

## Marketplace listing row (latest)

`persistence.marketplaceListingLatest`:

| Field | Value |
|-------|--------|
| `id` | `1367` |
| `listingId` | `MLC3804623142` |
| `listingUrl` | `https://articulo.mercadolibre.cl/MLC-3804623142-rotating-table-cell-phone-holder-support-desktop-stand-fo-_JM` |
| `status` | `active` |
| `publishedAt` | `2026-03-27T02:35:49.356Z` |

## Local asset manifest

`artifacts/ml-image-packs/product-32714/ml-asset-pack.json`:

- `listingId` = **`MLC3804623142`** (aligned with new publish).
- `cover_main` / `detail_mount_interface` remain approved with same `assetSource` lines as pre-publish notes.

## Partial state check

- **Images:** Supplier URLs on `products.images` after run — consistent with script design (temporary local paths only for ML upload).
- **External id:** New `listingId` persisted on latest marketplace listing and manifest.
- **Older listing:** If a prior `marketplace_listing` row exists for `MLC3804135582`, it was not deleted by P101; operations should treat **MLC3804623142** as canonical. Optional DB hygiene: archive or mark old rows as superseded (out of P101 scope unless requested).
