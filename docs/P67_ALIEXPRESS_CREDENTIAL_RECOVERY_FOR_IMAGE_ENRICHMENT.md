# P67 — AliExpress credential recovery for image enrichment

**Goal:** Make `backend/scripts/p66-enrich-product-images.ts` able to fetch **additional real supplier image URLs** for product **32690**.

## How enrichment resolves credentials

**Product owner:** `p66-enrich-product-images.ts` loads `product.userId` from the `products` row (P67 run: **`userId = 1`** for product `32690`).

### Path A — AliExpress Dropshipping API (primary)

- **Code:** `getDsApi(userId)` → `CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production')`, then sandbox if still no token.
- **Hard requirement:** `credentials.accessToken` must be truthy after merge/decrypt. Without it, **`getDsApi` returns `null`** → historically logged as **`no_dropshipping_credentials`**.
- **Resolution order** (`getCredentialEntry`): (1) **user** row for that `userId`, (2) **global** row (`scope: global`), (3) **env** via `ALIEXPRESS_DROPSHIPPING_APP_KEY`, `ALIEXPRESS_DROPSHIPPING_APP_SECRET`, and token vars (`ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN` / `_REFRESH_TOKEN`, etc.).
- **Refresh:** `refreshAliExpressDropshippingToken` only runs if credentials already load; it needs **refreshToken + appKey + appSecret** to mint a new access token and persist.

### Path B — AliExpress Affiliate API (P67 fallback, same script)

- **When:** Dropshipping API unavailable **or** returns no image URLs; still requires a valid **`aeProductId`** from `aliexpressUrl`.
- **Code:** `discoverViaAffiliate(userId, aeId, ship)` → `CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', 'production')` applied to a new `AliExpressAffiliateAPIService`, else constructor **env** keys.
- **Requirement:** `appKey` + `appSecret` (DB or **`ALIEXPRESS_AFFILIATE_APP_KEY` / `ALIEXPRESS_AFFILIATE_APP_SECRET`**). Uses `productdetail.get` + SKU detail for extra `sku_image_url`s.

## P67 execution result (this environment)

| Check | Result |
|--------|--------|
| Dropshipping OAuth | **`getDsApi` → null** — no usable `accessToken` for user `1` (production/sandbox) and no env token merge that satisfied the script |
| Affiliate | **`affiliate_not_configured`** — no affiliate app key/secret in env; DB credential path did not yield a configured affiliate client for this run |

**Classification:** **`blocked_by_credentials`** for automated enrichment in the workspace where P67 was executed.

## Minimum operator / infra actions (choose one lane)

1. **Dropshipping (preferred for parity with order flows):** Ensure `api_credentials` for **`aliexpress-dropshipping`**, `environment: production`, **`isActive: true`**, for **global** or **user `1`**, with valid **access** (+ refresh) tokens **or** set Railway/local env vars so `loadFromEnv` + `mergeDropshippingEnvIfTokenMissing` can supply the token.
2. **Affiliate (image-only recovery):** Add **`ALIEXPRESS_AFFILIATE_APP_KEY`** and **`ALIEXPRESS_AFFILIATE_APP_SECRET`** to the runtime **or** save affiliate credentials via the app’s credential UI for the same user — then rerun `p66-enrich-product-images.ts 32690`.

## Wrong-user hypothesis

If credentials exist only for **another** `userId`, enrichment for product `32690` will **not** see them until the product’s `userId` matches or **global** scope rows exist. Verify `products.userId` vs credential rows.
