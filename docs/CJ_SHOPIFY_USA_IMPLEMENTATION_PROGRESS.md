# CJ -> Shopify USA - Implementation Progress

**Last updated:** 2026-04-20

## Summary

`CJ -> Shopify USA` has all operator pages implemented as real surfaces, and the vertical now has a first proven stock-backed product published into Shopify.

The key operational finding from `2026-04-20` is that production Discover search was real, but deployed production evaluation/import was using stale CJ detail stock and therefore false-rejecting viable products. After correcting that stock source locally and using the same real DB plus the live production publish endpoint, the team completed a controlled flow with a real in-stock CJ product and confirmed the exact next blocker: the Shopify storefront password gate.

## Pages status

| Page | Route | Status | Backend endpoint(s) |
|------|-------|--------|---------------------|
| Discover | `/cj-shopify-usa/discover` | REAL | `GET /discover/search`, `POST /discover/evaluate`, `POST /discover/import-draft` |
| Overview | `/cj-shopify-usa/overview` | REAL | `GET /overview`, `GET /system-readiness` |
| Products | `/cj-shopify-usa/products` | REAL | `GET /products` |
| Store Products (Listings) | `/cj-shopify-usa/listings` | REAL | `GET /listings`, `POST /listings/draft`, `POST /listings/publish` |
| Orders | `/cj-shopify-usa/orders` | REAL | `GET /orders`, `POST /orders/sync` |
| Order Detail | `/cj-shopify-usa/orders/:orderId` | REAL | `GET /orders/:orderId` |
| Alerts | `/cj-shopify-usa/alerts` | REAL | `GET /alerts`, `POST /alerts/:id/acknowledge`, `POST /alerts/:id/resolve` |
| Profit | `/cj-shopify-usa/profit` | REAL | `GET /profit` |
| Logs | `/cj-shopify-usa/logs` | REAL | `GET /logs` |

## Backend changes completed in this pass

### Live-stock correction

Files updated:

- `backend/src/modules/cj-shopify-usa/services/cj-shopify-usa-discover.service.ts`
- `backend/src/modules/cj-shopify-usa/services/cj-shopify-usa-publish.service.ts`

What changed:

- `discover/evaluate` now enriches CJ product detail with live stock from `getStockForSkus(cjVid[])`
- `discover/import-draft` now stores live variant stock before choosing the target variant
- `buildDraft` refreshes live stock before draft validation
- `publishListing` refreshes live stock again before final Shopify publish

This removes the false `stock = 0` outcomes caused by stale `variant.stock` values in CJ detail payloads.

### Validation tooling

Added:

- `backend/scripts/cj-shopify-usa-live-validation.ts`

Purpose:

- runs live readiness + broad Discover search against production
- records search counts, candidate evaluations, and publish attempts
- writes evidence to `backend/cj-shopify-usa-live-validation-results.json`

The controlled hybrid operator run evidence is stored in:

- `backend/cj-shopify-usa-hybrid-run-result.json`

## Live validation result (2026-04-20)

### Broad production search

The following required keyword families were searched live in production, pages `1` and `2`, `20` results each page:

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

Result:

- `400` raw search results surfaced
- `40` candidates evaluated from the production Discover path
- `0` viable candidates selected by deployed production Discover

Why `0` viable candidates happened:

- not because CJ lacked products
- because deployed production Discover was reading stale stock and marking all evaluated variants as effectively zero-stock

### Fixed-service candidate scan

After applying live-stock enrichment locally, targeted searches immediately produced approved USA-viable candidates with real stock:

| Keyword | Candidate | Top stock | Shipping | Suggested sell |
|--------|-----------|----------:|----------|----------------|
| `travel pillow` | `Neck Pillow Travel Pillow` | `14432` | `$6.11`, `USPS+VIP`, `US`, `7d` | `$14.84` |
| `travel pillow` | `Travel pillow inflatable pillow` | `13503` | `$4.85`, `USPS+VIP`, `US`, `7d` | `$7.12` |
| `car phone holder` | `Car Phone Holder Car Holder Air Outlet Phone Holder` | `40000` | `$7.64`, `USPS+VIP`, `US`, `7d` | `$22.54` |
| `drawer organizer` | `Drawer organizer` | `14261` | `$5.03`, `USPS+VIP`, `US`, `7d` | `$7.45` |
| `facial roller` | `Ice Roller Massager Facial Ice Head Roller Massage` | `14761` | `$5.88`, `USPS+VIP`, `US`, `7d` | `$9.13` |
| `dog leash` | `Dog leash dog leash pet leash` | `14808` | `$5.88`, `USPS+VIP`, `US`, `7d` | `$8.32` |
| `resistance bands` | `Fabric Resistance Bands` | `33334` | `$9.41`, `USPS+VIP`, `US`, `7d` | `$19.20` |

Chosen for the controlled flow:

- `Neck Pillow Travel Pillow`
- reason: strong real stock, multiple usable variants, `US` origin, known shipping, and a cleaner mid-range sell price than the ultra-cheap alternatives

### Controlled end-to-end flow

Result:

- Discover candidate selected: `479E2C57-73CA-4F63-B77E-6ABC5B2F32D5`
- Evaluate decision: `APPROVED`
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
- Orders sync after publish:
  - `ok = true`
  - `count = 0`

### Buyer-facing result

The PDP check returned:

- storefront URL: `https://ivanreseller-2.myshopify.com/products/neck-pillow-travel-pillow-cjjjjfzt00492-pink`
- HTTP status: `200`
- final URL: `https://ivanreseller-2.myshopify.com/password`
- `passwordGate = true`

So the product exists and is published, but the PDP is not publicly accessible to a buyer yet.

## Verification

- Backend type-check: PASS
- Frontend build: PASS
- `CJ -> eBay USA`: untouched
- `CJ -> ML Chile`: untouched

## Remaining operational gaps

1. `Storefront password gate` is now the main commercial blocker after successful publish.
2. The live-stock correction still needs a production deployment so the same result is repeatable directly from the production Discover UI/API path.
3. Controlled buyer order / fulfillment / tracking still needs a live pass after the storefront gate is opened.
