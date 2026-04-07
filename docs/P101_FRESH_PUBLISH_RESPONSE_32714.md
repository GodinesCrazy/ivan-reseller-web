# P101 — Fresh publish response (product 32714)

## Publish path

`MarketplaceService.publishProduct` → `publishToMercadoLibre` → `MercadoLibreService.createListing` (production).

- **Script:** `backend/scripts/p101-clean-republish-32714.ts`
- **`duplicateListing`:** `true` (stale app row / deleted ML item scenario).
- **Runtime:** `ENABLE_ML_PUBLISH=true` set during script execution.

## Code fix (duplicate listing guard)

`publishToMercadoLibre` previously threw whenever *any* `marketplace_listing` row existed for the product, **ignoring** `request.duplicateListing`. P101 now passes `duplicateListing` into `publishToMercadoLibre` as `allowDuplicateListing`, so the guard is skipped when the operator intentionally republishes after ML-side deletion.

## ML publish payload — picture order (runtime proof)

From `p101-republish-result.json` → `mlPublishPayloadImageOrder`:

| Position | Role | Absolute path | SHA-256 |
|----------|------|---------------|---------|
| 0 | `portada_cover_main` | `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32714\cover_main.png` | `f0514738a2085f297fbd95eade925442cc8388e622953243ce991aa29fa21122` |
| 1 | `detail_mount_interface` | `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32714\detail_mount_interface.png` | `7c0197a5c00fb5b607f365c528da248e02dd2eef57de253014f70adc1a667c13` |

The script temporarily sets `product.images` to a JSON array of these two local paths for the publish call, then restores supplier URLs.

## Publish API outcome

From `p101-republish-result.json` → `publishResult`:

```json
{
  "success": true,
  "marketplace": "mercadolibre",
  "listingId": "MLC3804623142",
  "listingUrl": "https://articulo.mercadolibre.cl/MLC-3804623142-rotating-table-cell-phone-holder-support-desktop-stand-fo-_JM"
}
```

- **New listing id:** `MLC3804623142`
- **Permalink:** `https://articulo.mercadolibre.cl/MLC-3804623142-rotating-table-cell-phone-holder-support-desktop-stand-fo-_JM`
- **New `user_product_id` (from item resource):** `MLCU3872268316`

## Manifest update

`ml-asset-pack.json` **`listingId`** updated to **`MLC3804623142`** after success (`manifestListingIdUpdated: true` in result JSON).
