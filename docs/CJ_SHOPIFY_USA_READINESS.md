# CJ -> Shopify USA - Readiness

## Purpose
The readiness model for `CJ -> Shopify USA` reflects the real Shopify Dev Dashboard app flow
using `client_credentials` grant. It is intentionally fail-closed:

- no fake Shopify readiness
- no green status without real token exchange
- no silent fallback to DB-stored Shopify tokens
- no assumption that Chile operators can use Shopify Payments

## Current Live State (audited 2026-04-19)

| Check | Status | Notes |
|-------|--------|-------|
| Module Flag | **PASS** | `ENABLE_CJ_SHOPIFY_USA_MODULE=true` in Railway |
| Database | **PASS** | Prisma connected |
| Pricing Settings | **PASS** | Default margins present |
| CJ Credentials | **PASS** | `cj-dropshipping` apiKey available |
| Shopify Config | **PASS** | `SHOPIFY_SHOP=ivanreseller-2.myshopify.com` set in Railway |
| Shopify Auth | **FAIL** | Token exchange works; shop name resolved to "IvanReseller"; **missing 5 scopes** — see below |
| Frontend visibility | **FIXED** | `VITE_ENABLE_CJ_SHOPIFY_USA_MODULE=true` in `.env.production` |
| Webhook registration | **PASS** | Both topics registered on Shopify |

### Shopify Token Exchange — WORKS
- Shop domain: `ivanreseller-2.myshopify.com`
- Store name: **IvanReseller** (confirmed live)
- Currency: **USD** ✓
- Country: CL (Chile operator)
- Auth mode: `client_credentials`

### Granted scopes (current app installation)
```
read_fulfillments, write_fulfillments, write_inventory, read_inventory,
read_orders, read_products, write_products
```

### Missing scopes (external action required in Shopify Partners)
```
read_locations
read_publications
write_publications
read_merchant_managed_fulfillment_orders
write_merchant_managed_fulfillment_orders
```

### Webhooks registered (2026-04-19)
```
ORDERS_CREATE  → https://ivanreseller.com/api/cj-shopify-usa/webhooks/orders-create
APP_UNINSTALLED → https://ivanreseller.com/api/cj-shopify-usa/webhooks/app-uninstalled
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

## Remaining External Blocker to Full `ready: true`

The Shopify app at [partners.shopify.com](https://partners.shopify.com) must be updated to request
the missing scopes, a new app version published, and the store must approve the updated scope set.

**Exact scopes to add in Shopify Partners → App → App setup → Configuration:**
```
read_locations
read_publications
write_publications
read_merchant_managed_fulfillment_orders
write_merchant_managed_fulfillment_orders
```

**Steps:**
1. Go to Shopify Partners → ivan-reseller app → Configuration
2. Add the 5 missing scopes listed above
3. Save and create a new app version (Release)
4. In the store (ivanreseller-2.myshopify.com) → Apps → approve updated permissions
5. Run `POST /api/cj-shopify-usa/auth/test` — expect `ok: true`
6. Run `GET /api/cj-shopify-usa/system-readiness` — expect `ready: true`

---

## What Was Fixed in This Session (2026-04-19)

| Item | Change |
|------|--------|
| `SHOPIFY_SHOP` was missing | Set to `ivanreseller-2.myshopify.com` in Railway and `.env.local` |
| Backend routes were never registered | Added `app.use('/api/cj-shopify-usa', ...)` in `app.ts` — committed and pushed |
| Frontend flag missing in production | Added `VITE_ENABLE_CJ_SHOPIFY_USA_MODULE=true` to `frontend/.env.production` |
| Probe hard-failed on any missing scope | Redesigned probe into independent phases — each scope-gated field isolated |
| Webhooks not registered | Registered via `POST /webhooks/register` — both topics confirmed on Shopify |
