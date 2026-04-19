# CJ -> Shopify USA - Auth Integration

## Implemented Auth Flow
The backend now uses Shopify's current **client credentials grant** for Dev Dashboard apps that are:

- owned by the same organization as the target store
- already installed on that store

The backend performs:

1. Read `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` from env
2. Resolve the target store from `SHOPIFY_SHOP` or `shopifyStoreUrl`
3. Exchange credentials at:
   - `https://{shop}.myshopify.com/admin/oauth/access_token`
4. Cache the returned short-lived token in memory
5. Use that token against the Shopify GraphQL Admin API

## Why This Replaced the Previous Model
The older module version expected:

- `shopifyStoreUrl` in DB
- `shopifyAccessToken` in DB

That is no longer the correct security model for this app setup.

The updated implementation:

- avoids storing Shopify admin access tokens in DB
- avoids operator-managed raw token pasting
- matches Shopify's current Dev Dashboard same-org app model

## Secure Storage Split

### Stored in env / Railway only
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`

### Stored in DB only when needed as non-secret metadata
- `shopifyStoreUrl`
- `shopifyLocationId`
- vertical pricing / margin settings

### Not stored in DB for auth
- short-lived Shopify Admin API token
- Shopify client secret

## Backend Components Added / Reworked

### `cjShopifyUsaAdminService`
- token exchange
- token caching
- GraphQL Admin API client
- connection probe
- webhook registration
- product publish helpers
- inventory sync helper
- order pull helper
- fulfillment / tracking push helper

### `cjShopifyUsaAuthService`
- now validates real client-credentials auth instead of a pasted static token

### `cjShopifyUsaConfigService`
- exposes safe config snapshots
- ignores legacy `shopifyAccessToken` writes
- keeps `shopifyStoreUrl` only as safe metadata fallback

### `webhook-signature.middleware.ts`
- now validates Shopify `X-Shopify-Hmac-SHA256`
- uses `WEBHOOK_SECRET_SHOPIFY` or `SHOPIFY_CLIENT_SECRET`

## Current Runtime Status

### Completed
- real Shopify client ID and client secret were found locally
- stored into ignored local backend env
- stored into Railway backend variables
- module flag and Shopify webhook signature flag were added to Railway
- backend auth code is implemented

### Still required for live auth proof
- the store `*.myshopify.com` domain

Without that domain, the backend cannot complete live token exchange even though the credentials are now in the correct secure place.
