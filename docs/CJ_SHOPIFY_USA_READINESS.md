# CJ -> Shopify USA - Readiness

## Purpose
The readiness model for `CJ -> Shopify USA` reflects the real Shopify Dev Dashboard app flow
using `client_credentials` grant. It is intentionally fail-closed:

- no fake Shopify readiness
- no green status without real token exchange
- no silent fallback to DB-stored Shopify tokens
- no assumption that Chile operators can use Shopify Payments

## Current Live State (audited 2026-04-20)

| Check | Status | Notes |
|-------|--------|-------|
| Module Flag | **PASS** | `ENABLE_CJ_SHOPIFY_USA_MODULE=true` in Railway |
| Database | **PASS** | Prisma connected |
| Pricing Settings | **PASS** | Default margins present |
| CJ Credentials | **PASS** | `cj-dropshipping` apiKey available |
| Shopify Config | **PASS** | `SHOPIFY_SHOP=ivanreseller-2.myshopify.com` set in Railway |
| Shopify Auth | **PASS** | Token exchange works; shop name resolved to "IvanReseller"; required scopes are granted live |
| Frontend visibility | **FIXED** | `VITE_ENABLE_CJ_SHOPIFY_USA_MODULE=true` in `.env.production` |
| Webhook registration | **WARNING** | `auth/test` currently returns `webhookSubscriptions = []` |

### Shopify Token Exchange — WORKS
- Shop domain: `ivanreseller-2.myshopify.com`
- Store name: **IvanReseller** (confirmed live)
- Currency: **USD** ✓
- Country: CL (Chile operator)
- Auth mode: `client_credentials`

### Granted scopes (current app installation)
```
read_fulfillments, write_fulfillments, write_inventory, read_inventory,
read_locations, read_merchant_managed_fulfillment_orders,
write_merchant_managed_fulfillment_orders, read_orders, read_products,
write_products, read_publications, write_publications
```

### Missing scopes (live)
```
[]
```

### Webhook subscriptions (live 2026-04-20)
```
[]
```

---

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
- store domain must exist via `SHOPIFY_SHOP` env var or `shopifyStoreUrl` in DB settings

### 5. Live Shopify auth
- Backend exchanges credentials against:
  - `https://{shop}.myshopify.com/admin/oauth/access_token`
- Probe is now split into independent phase queries — each scope-gated field is tested separately
- A missing scope for one field does not prevent the probe from completing

### 6. Scopes
Required:
- `read_products`, `write_products`
- `read_orders`
- `read_inventory`, `write_inventory`
- `read_locations`
- `read_publications`, `write_publications`
- `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders`

### 7. Store currency
- Must be `USD`

### 8. Inventory location
- At least one active Shopify location for inventory sync

### 9. Publication target
- At least one Shopify publication for product publishing

### 10. Webhook automation
- Required topics: `ORDERS_CREATE`, `APP_UNINSTALLED`

### 11. Payment reality
- Chile operator: third-party gateway required; Shopify Payments not available

---

## Current Warnings / Follow-up

`GET /api/cj-shopify-usa/system-readiness` now returns `ready: true`, but two live warnings remain:

1. **Webhook automation warning** — `ORDERS_CREATE` and `APP_UNINSTALLED` are not currently present in `webhookSubscriptions`.
2. **Checkout / payments reality warning** — the operator is Chile-based, so third-party checkout remains required; do not assume Shopify Payments.

Neither warning blocks Discover, Evaluate, Import Draft, or controlled publish.

---

## What Was Fixed In Live Production (2026-04-20)

| Item | Change |
|------|--------|
| Stale scope diagnosis | Corrected: `missingScopes = []` live and `shopify.scopes = PASS` |
| Discover not live in production | Deployed commit `a73387a` so `/api/cj-shopify-usa/discover/*` exists in production |
| Shopify publish failed on inventory sync | Updated `inventorySetQuantities` call for Shopify API `2026-04` using `changeFromQuantity: null` |
| Controlled publish validation | Verified live publish success: listing `#2` reached `ACTIVE` with Shopify product + variant IDs |
