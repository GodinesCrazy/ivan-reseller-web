# P74 — Live cover replacement

## Target

- **productId:** 32690  
- **listingId:** MLC3786354420  
- **Marketplace:** Mercado Libre Chile  

## Command

```bash
cd backend
npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
```

## Picture IDs — BEFORE

| Slot order | picture id | max_size (API) |
|------------|------------|----------------|
| 1 (portada) | `777265-MLC109385263977_032026` | 1200×1200 |
| 2 | `643864-MLC108578802150_032026` | 1200×1200 |

**Listing state before:** `status: under_review`, `sub_status: ["waiting_for_patch"]`

## Picture IDs — AFTER

| Slot order | picture id | max_size (API) |
|------------|------------|----------------|
| 1 (portada) | `611366-MLC108584567366_032026` | **761×1200** (see note) |
| 2 | `955159-MLC109387401979_032026` | 1200×1200 |

**Listing state after:** `status: active`, `sub_status: []`

## Classification

`listing_active_policy_clean` — no `updateError` / `activateError` in script output.

## Assets uploaded

1. `artifacts/ml-image-packs/product-32690/cover_main.png` (remediated portada)  
2. `artifacts/ml-image-packs/product-32690/detail_mount_interface.png` (secondary; order preserved as script’s approved upload order)

## Runtime notes

- MercadoLibre service emitted a **warning** on cover upload: recommended **≥1200×1200** while reporting **`761×1200`** for that picture id. **Local** `cover_main.png` is **1536×1536**. Capture this discrepancy for seller-UI follow-up if a new warning appears.
- **permalink:** `https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM`

## Local DB sync (script output)

- `marketplaceListingStatus`: active  
- `productStatus`: PUBLISHED  
- `productIsPublished`: true  
