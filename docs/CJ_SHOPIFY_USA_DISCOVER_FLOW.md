# CJ -> Shopify USA - Discover Flow

**Created:** 2026-04-19  
**Updated:** 2026-04-20

## What Discover does

The Discover screen is the operator entry point for `CJ -> Shopify USA`. It allows the team to:

1. Search the live CJ catalog by keyword
2. Evaluate a result with shipping + margin math
3. Import a selected CJ product into the DB
4. Create a draft listing ready for Shopify publish
5. Move to Listings and publish the product into Shopify

Discover is not decorative. Search, evaluation, import, draft creation, and publish all map to real pipeline state.

## Endpoints used

All endpoints are under `/api/cj-shopify-usa/` and require authentication plus the module enabled.

### `GET /discover/search`

Live search of the CJ catalog via `product/listV2`.

Query params:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `keyword` | string | required | Search term |
| `page` | number | `1` | 1-indexed page |
| `pageSize` | number | `20` | Results per page, max `50` |

Behavior:

- no DB write
- returns real CJ search results
- records `discover.search` traces

### `POST /discover/evaluate`

Fetches full CJ product detail, refreshes live variant stock, requests a warehouse-aware shipping quote, and runs qualification math.

Body:

```json
{
  "cjProductId": "...",
  "quantity": 1,
  "destPostalCode": "10001"
}
```

Behavior:

- no DB write
- enriches stock with `getStockForSkus(cjVid[])`
- records `discover.evaluate` traces
- returns shipping + qualification preview for the operator

### `POST /discover/import-draft`

Imports a CJ product snapshot to DB and creates a draft listing.

Body:

```json
{
  "cjProductId": "...",
  "variantCjVid": "...",
  "quantity": 1,
  "destPostalCode": "10001"
}
```

Behavior:

1. fetches CJ product detail
2. refreshes live stock with `getStockForSkus(cjVid[])`
3. upserts `CjShopifyUsaProduct`
4. upserts `CjShopifyUsaProductVariant`
5. stores a shipping quote when available
6. calls `cjShopifyUsaPublishService.buildDraft()`
7. returns a real `DRAFT` listing

## Stock truth model

### Problem found on 2026-04-20

The deployed production Discover flow was reading `variant.stock` directly from `adapter.getProductById()`. In practice, that field was stale for many CJ products and caused broad live searches to collapse into false zero-stock rejections.

Observed production symptom:

- `400` search results surfaced across the required keyword families
- `40` candidates were evaluated from production Discover
- every evaluated candidate was rejected as having no variant meeting `minStock`

This was not a true market absence. It was a stock-source bug.

### Fix implemented

The `CJ -> Shopify USA` flow now uses live stock truth:

- `discover/evaluate` refreshes stock before qualification
- `discover/import-draft` refreshes stock before choosing and persisting the target variant
- `buildDraft` refreshes stock before draft validation
- `publishListing` refreshes stock again before publish

This aligns `CJ -> Shopify USA` with the stock-validation pattern already used in other CJ verticals.

Deployment status:

- deployed to Railway production on `2026-04-20`
- backend commit: `93f9777`

## Connection to the rest of the pipeline

```text
[Discover]
  GET  /discover/search
  POST /discover/evaluate
  POST /discover/import-draft
         ↓
[Listings]
  GET  /listings
  POST /listings/publish
         ↓
[Orders]
  Shopify webhook / manual sync
         ↓
[Profit / Logs]
  traces, tracking, reconciliation, profit snapshots
```

## Live execution result (2026-04-20)

### Broad search proof

Required families searched live in production:

- `phone accessories`
- `home organization`
- `kitchen gadgets`
- `beauty tools`
- `pet accessories`
- `fitness accessories`
- `office accessories`
- `car accessories`
- `led gadgets`
- `travel accessories`

Execution details:

- pages searched: `1` and `2`
- page size: `20`
- raw CJ results surfaced: `400`
- evaluated candidates from production Discover: `40`

Sample production discards before the stock fix:

| Keyword | Product | Result |
|--------|---------|--------|
| `phone accessories` | `U Mobile Phone Clip Hose Bracket Mobile Phone Accessories` | rejected, `maxVariantStock = 0` |
| `home organization` | `Home Storage Organization Pendant Durable Practical` | rejected, `maxVariantStock = 0` |
| `kitchen gadgets` | `Wine Aerator Kitchen Gadgets` | rejected, `maxVariantStock = 0` |
| `beauty tools` | `Beauty tools` candidates in the sweep | rejected, `maxVariantStock = 0` |
| `travel accessories` | `Travel accessories` candidates in the sweep | rejected, `maxVariantStock = 0` |

### Approved candidates after live-stock correction

Once live stock was used, approved candidates appeared immediately. Examples:

| Keyword | Candidate | Top stock | Shipping | Decision |
|--------|-----------|----------:|----------|----------|
| `travel pillow` | `Neck Pillow Travel Pillow` | `14432` | `$6.11`, `USPS+VIP`, `US`, `7d` | `APPROVED` |
| `travel pillow` | `Travel pillow inflatable pillow` | `13503` | `$4.85`, `USPS+VIP`, `US`, `7d` | `APPROVED` |
| `car phone holder` | `Car Phone Holder Car Holder Air Outlet Phone Holder` | `40000` | `$7.64`, `USPS+VIP`, `US`, `7d` | `APPROVED` |
| `drawer organizer` | `Drawer organizer` | `14261` | `$5.03`, `USPS+VIP`, `US`, `7d` | `APPROVED` |
| `dog leash` | `Dog leash dog leash pet leash` | `14808` | `$5.88`, `USPS+VIP`, `US`, `7d` | `APPROVED` |

### Controlled successful flow

Chosen product:

- CJ product: `479E2C57-73CA-4F63-B77E-6ABC5B2F32D5`
- title: `Neck Pillow Travel Pillow`
- chosen variant:
  - `cjVid = EA821FE6-E766-4F1E-9A50-04D7FBB313B7`
  - `cjSku = CJJJJFZT00492-Pink`
  - stock `14432`

Controlled flow result:

- Evaluate: `APPROVED`
- Import Draft:
  - `dbProductId = 5`
  - `listing.id = 3`
  - `status = DRAFT`
  - `listedPriceUsd = 14.62`
- Publish:
  - `status = ACTIVE`
  - `shopifyProductId = gid://shopify/Product/9145755435220`
  - `shopifyVariantId = gid://shopify/ProductVariant/47823252390100`
  - `shopifyHandle = neck-pillow-travel-pillow-cjjjjfzt00492-pink`

### Post-deploy production proof

After the Railway deploy, production Discover was checked directly:

- `GET /discover/search?keyword=travel pillow&page=1&pageSize=10` returned `10` results
- the first three production titles were:
  - `Neck Pillow Travel Pillow`
  - `Travel pillow inflatable pillow`
  - `Travel U-shaped pillow eye protection neck pillow cervical pillow neck pillow travel portable pillow`
- `POST /discover/evaluate` for `479E2C57-73CA-4F63-B77E-6ABC5B2F32D5` returned:
  - decision `APPROVED`
  - shipping `$6.11`
  - method `USPS+VIP`
  - origin `US`
  - `5` eligible variants
  - top stock `14432`

## Buyer-facing status

The publish succeeded technically, but the buyer-facing storefront check returned:

- status `200`
- final URL `/password`
- marker `Opening soon`

Meaning:

- the product exists in Shopify
- the PDP is not publicly reachable yet
- the exact blocker is the Shopify storefront password gate, not a listing-creation failure

## Evidence artifacts

- `backend/cj-shopify-usa-live-validation-results.json`
- `backend/cj-shopify-usa-hybrid-run-result.json`
- `docs/CJ_SHOPIFY_USA_LIVE_PRODUCT_VALIDATION.md`
