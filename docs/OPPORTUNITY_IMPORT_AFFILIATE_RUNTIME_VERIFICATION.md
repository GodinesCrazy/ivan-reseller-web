# Affiliate (and Dropshipping) runtime verification

## Credentials

| Integration | Credential type in app | Used for |
|-------------|-------------------------|----------|
| AliExpress Affiliate | `aliexpress-affiliate` (production, then sandbox fallback) | `getSKUDetails`, `getProductDetails` |
| AliExpress Dropshipping | `aliexpress-dropshipping` (production) | `getProductInfo` fallback for SKU + cheapest shipping method |

## How to verify for a real user (production)

1. **Settings / API keys**: Ensure the authenticated user has at least one of:
   - Affiliate app key + secret (Portals / Affiliate API), **or**
   - Dropshipping OAuth token (common for order placement).

2. **POST /api/products** response body (after backend update):
   - `data.opportunityImportEnrichment.ok` — boolean
   - `data.opportunityImportEnrichment.reason` — e.g. `sku_and_shipping_resolved`, `affiliate_api_not_configured`, `partial_resolution`, `missing_aliexpress_item_id`

3. **DB / admin inspection** (optional):
   - `products.productData` JSON root: `opportunityImport.affiliateEnrichment`, `affiliateApiConfigured`, `affiliateEnrichmentReason`
   - Columns: `aliexpressSku`, `shippingCost`, `totalCost`

## Honest limitations

- If both Affiliate and Dropshipping calls fail or return no SKUs, `missingSku` remains a **real** blocker until another pipeline fills the product.
