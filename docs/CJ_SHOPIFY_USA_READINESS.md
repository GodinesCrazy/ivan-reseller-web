# CJ -> Shopify USA - Readiness

## Purpose
The readiness model for `CJ -> Shopify USA` now reflects the real Shopify Dev Dashboard app flow instead of a legacy manual access-token setup.

It is intentionally fail-closed:

- no fake Shopify readiness
- no green status without real token exchange
- no silent fallback to DB-stored Shopify tokens
- no assumption that Chile operators can use Shopify Payments

## Readiness Checks

### 1. Module flag
- Requires `ENABLE_CJ_SHOPIFY_USA_MODULE=true`

### 2. Database
- Prisma connectivity must work

### 3. CJ credentials
- `cj-dropshipping` production apiKey must exist for the operator

### 4. Shopify config
- `SHOPIFY_CLIENT_ID` must exist
- `SHOPIFY_CLIENT_SECRET` must exist
- store domain must exist through:
  - `SHOPIFY_SHOP`, or
  - `shopifyStoreUrl`

### 5. Live Shopify auth
- Backend exchanges the app client credentials against:
  - `https://{shop}.myshopify.com/admin/oauth/access_token`
- This proves the app is installed on the store and the credentials are valid for that store

### 6. Scopes
- The backend checks granted scopes against the vertical requirements:
  - `read_products`
  - `write_products`
  - `read_orders`
  - `read_inventory`
  - `write_inventory`
  - `read_locations`
  - `read_publications`
  - `write_publications`
  - `read_merchant_managed_fulfillment_orders`
  - `write_merchant_managed_fulfillment_orders`

### 7. Store currency
- Store currency must be `USD`

### 8. Inventory location
- At least one usable Shopify location must exist for inventory sync

### 9. Publication target
- At least one Shopify publication must exist
- Online Store publication is the preferred publish target

### 10. Webhook automation
- Required topics:
  - `ORDERS_CREATE`
  - `APP_UNINSTALLED`
- Missing webhooks are a warning, not a fake success

### 11. Payment reality
- If the operator context is Chile (`CL`), readiness warns that Shopify Payments should not be assumed
- Third-party gateway setup remains an operator responsibility

## Current Blocking Condition
During this implementation pass, the real Shopify client credentials were found and stored securely, but the store `*.myshopify.com` domain was not found in:

- `API2.txt` exact path
- fallback local credential file
- Railway vars
- DB settings

Because of that, readiness is expected to fail specifically on the Shopify config / auth checks until the store domain is supplied.

## Operator Runbook
1. Provide the store myshopify domain as `SHOPIFY_SHOP`, or save it in `shopifyStoreUrl`.
2. Run `POST /api/cj-shopify-usa/auth/test`.
3. Run `POST /api/cj-shopify-usa/webhooks/register`.
4. Re-check `GET /api/cj-shopify-usa/system-readiness`.
5. Only after readiness passes, publish a controlled listing and sync the next Shopify order.
