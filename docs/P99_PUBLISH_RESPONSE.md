# P99 — Publish response capture (product 32714)

## Application-level result (`PublishResult`)

From `MarketplaceService.publishProduct` (returned to caller / equivalent to API success path):

```json
{
  "success": true,
  "marketplace": "mercadolibre",
  "listingId": "MLC3804135582",
  "listingUrl": "https://articulo.mercadolibre.cl/MLC-3804135582-rotating-table-cell-phone-holder-support-desktop-stand-fo-_JM"
}
```

## Mercado Libre item verification (GET `/items/{id}`)

Fetched with the same seller access token after publish. Stored in `p99-publish-result.json` as `mlItemVerification`. Summary:

| Field | Value |
| --- | --- |
| `id` | `MLC3804135582` |
| `status` | `active` |
| `permalink` | `https://articulo.mercadolibre.cl/MLC-3804135582-rotating-table-cell-phone-holder-support-desktop-stand-fo-_JM` |
| `price` / `currency_id` | `11400` / `CLP` (ML site currency; consistent with ~12 USD listing intent) |
| `title` (truncated in API) | `Rotating Table Cell Phone Holder Support Desktop Stand Fo...` |
| `category_id` | `MLC159251` |
| `domain_id` | `MLC-TABLET_STANDS` |
| `listing_type_id` | `gold_special` |
| `pictures` | **2** entries (both accepted on ML CDN) |
| `warnings` | `[]` |
| `sub_status` | `[]` |

## Status probe (`getItemStatus`)

```json
{
  "status": "active",
  "sub_status": [],
  "health": null,
  "permalink": "https://articulo.mercadolibre.cl/MLC-3804135582-rotating-table-cell-phone-holder-support-desktop-stand-fo-_JM"
}
```

## First attempt (before code fix)

An earlier run with only the DB image swap failed closed with:

- `success: false`
- `error`: `Product must have at least one image before publishing. Please add images to the product.`

Root cause: HTTP-only `parseImageUrls` dropped local filesystem paths. Resolved by the ML-only local path fallback in `marketplace.service.ts` (see `P99_CONTROLLED_REAL_PUBLISH.md`).
