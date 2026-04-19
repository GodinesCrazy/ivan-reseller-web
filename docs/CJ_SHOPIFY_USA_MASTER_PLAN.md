# CJ -> Shopify USA - Master Plan

## Current State (updated 2026-04-19)
`CJ -> Shopify USA` is now wired around the correct Shopify Dev Dashboard app model for a same-org, single-store integration:

- Shopify app credentials live in backend env / Railway only.
- The backend exchanges `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` for a short-lived Admin API token using `client_credentials`.
- The module no longer depends on a manually stored Shopify admin access token in DB.
- **`SHOPIFY_SHOP=ivanreseller-2.myshopify.com` is now set in Railway and `.env.local`.**
- Token exchange is live and confirmed working — store "IvanReseller" resolved, currency USD.
- Frontend sidebar and routes are now registered and visible when `VITE_ENABLE_CJ_SHOPIFY_USA_MODULE=true`.
- Both Shopify webhooks (`ORDERS_CREATE`, `APP_UNINSTALLED`) are registered.
- Remaining external blocker: 5 Shopify scopes need to be added in the Shopify Partners dashboard
  and the store must approve the updated app version. See `CJ_SHOPIFY_USA_READINESS.md`.

## Architecture Decisions

### Secrets vs DB
- **Env / secret manager only**
  - `SHOPIFY_CLIENT_ID`
  - `SHOPIFY_CLIENT_SECRET`
- **DB metadata only**
  - `shopifyStoreUrl` as optional safe store-domain fallback
  - `shopifyLocationId`
  - pricing / margin / operational settings
- **Not used anymore for auth**
  - `shopifyAccessToken` legacy DB field remains in schema for backwards compatibility, but the module ignores it and does not accept it in config updates.

### Shopify Auth Model
- Auth mode: `client_credentials`
- Token lifetime: short-lived (refreshed by repeating the same exchange)
- Token storage: in-memory cache only
- API surface used by the backend: GraphQL Admin API

## What Was Implemented

### Backend foundations
- Added typed env support for:
  - `ENABLE_CJ_SHOPIFY_USA_MODULE`
  - `SHOPIFY_CLIENT_ID`
  - `SHOPIFY_CLIENT_SECRET`
  - `SHOPIFY_SHOP`
  - `SHOPIFY_API_VERSION`
  - `WEBHOOK_VERIFY_SIGNATURE_SHOPIFY`
  - `WEBHOOK_SECRET_SHOPIFY`
- Added `cjShopifyUsaAdminService` for:
  - shop-domain normalization
  - token exchange
  - in-memory token caching
  - Shopify connection probe
  - webhook registration
  - product upsert
  - inventory sync
  - publication
  - order pull
  - fulfillment / tracking push

### Readiness and operator surfaces
- Replaced manual-token readiness with honest readiness checks for:
  - module flag
  - DB connectivity
  - CJ credential presence
  - Shopify env secrets presence
  - Shopify shop-domain presence
  - live Shopify auth
  - required scopes
  - USD currency
  - location availability
  - publication availability
  - webhook automation completeness
  - Chile operator payment-gateway reality

### CJ -> Shopify USA vertical continuation
- Real overview counts from DB
- Safe config snapshot endpoint with auth summary and no secret exposure
- Auth probe endpoint
- Webhook registration endpoint
- Draft listing generation from existing CJ product / variant data
- Shopify publish flow:
  - product upsert
  - inventory quantity set
  - publication to Online Store-like channel
- Shopify order ingestion:
  - manual sync endpoint
  - webhook ingestion path
  - fail-closed mapping when multiple or zero managed line items match
- Shopify fulfillment / tracking sync:
  - uses explicit local tracking or CJ tracking
  - pushes fulfillment only when a single clear fulfillment target exists

## Remaining External Blocker
- The store `*.myshopify.com` domain is still missing.
- Until `SHOPIFY_SHOP` is provided, or `shopifyStoreUrl` is saved with the myshopify domain, live Shopify token exchange cannot succeed and readiness will correctly stay red on the Shopify auth check.

## Next Correct Step
1. Add the real store domain as `SHOPIFY_SHOP` in backend env / Railway, or save it in `shopifyStoreUrl`.
2. Run `POST /api/cj-shopify-usa/auth/test`.
3. Run `POST /api/cj-shopify-usa/webhooks/register`.
4. Confirm readiness passes.
5. Publish one controlled CJ draft listing and then sync a real Shopify order.
