# FINAL DROPSHIPPING ACTIVATION STATUS

**Date:** 2026-02-24  
**Objective:** Confirm AliExpress Dropshipping OAuth is active and that `executePurchase` uses `placeOrder()` (Dropshipping API), not Puppeteer fallback, when the user has valid credentials.

---

## OAUTH STATUS

**ACTIVE** (code path verified)

| Check | Status | Detail |
|-------|--------|--------|
| Token storage | OK | `api_credentials` table stores encrypted JSON in `credentials` for `apiName = 'aliexpress-dropshipping'`, `userId`, `environment`. JSON includes `accessToken`, `refreshToken`, `appKey`, `appSecret`, `sandbox`. |
| OAuth callback | OK | GET `/aliexpress/callback` (or `/api/marketplace-oauth/callback`) exchanges `code` for tokens and calls `CredentialsManager.saveCredentials(userId, 'aliexpress-dropshipping', updatedCreds, environment)`. |
| Auth URL | OK | GET `/api/marketplace/auth-url/aliexpress-dropshipping` (authenticated) returns authorization URL; frontend APISettings uses it for "Conectar". |
| Credential read | OK | `CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', environment)` returns decrypted object; `creds.accessToken` is used to decide API vs fallback. |

**Validation (runtime):** For a given user to use Dropshipping API, there must be a row in `api_credentials` with that `userId`, `apiName = 'aliexpress-dropshipping'`, and the decrypted `credentials` JSON must contain a non-empty `accessToken` (obtained via OAuth flow). No valid token ? fallback to Puppeteer or error.

---

## API ORDER STATUS

**ACTIVE** (executePurchase uses placeOrder when creds valid)

| Check | Status | Detail |
|-------|--------|--------|
| executePurchase(request, userId) | OK | When `userId` is present, it loads creds with `CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', env)`. If `creds && creds.accessToken`, it uses Dropshipping API only. |
| placeOrder() used | OK | `aliexpressDropshippingAPIService.setCredentials(dropshippingCreds)` then `aliexpressDropshippingAPIService.placeOrder({ productId, skuId, quantity, shippingAddress, ... })`. Success path returns immediately with `orderId` / `orderNumber`. |
| Puppeteer fallback | Not used when API path succeeds | Puppeteer block runs only when: `userId` is missing, or no creds, or no `accessToken`, or productId cannot be extracted from URL, or API throws (except on `ACCESS_TOKEN_EXPIRED`, which returns error without fallback). When API path runs and succeeds, execution never reaches the Puppeteer branch. |
| userId propagation | OK | `order-fulfillment.service.ts` ? `attemptPurchase(..., order.userId ?? undefined)` ? `placeOrder(request, userId)` ? `executePurchase(request, userId)`. Order owner?s `userId` is passed through. |

**Code reference:** `backend/src/services/aliexpress-auto-purchase.service.ts`: lines 198?353 use Dropshipping API and return on success; lines 382+ are Puppeteer fallback, entered only when the API path is not taken or fails (and not with ACCESS_TOKEN_EXPIRED).

---

## PRODUCTION STATUS

**READY** (provided DB and env are configured)

| Requirement | Status |
|-------------|--------|
| Database | `api_credentials` stores per-user `aliexpress-dropshipping` credentials with `accessToken`. Migrations applied. |
| OAuth flow | Authorization URL ? user authorizes ? callback exchanges code ? tokens saved. No hardcoded secrets; env only. |
| Fulfillment ? API | Order has `userId` ? fulfillment passes it ? `placeOrder(userId)` ? `executePurchase(request, userId)` ? if user has valid token, `placeOrder()` is called and Puppeteer is not used. |
| Token expiry | On `ACCESS_TOKEN_EXPIRED`, the code returns an error and does not fall back to Puppeteer; user must re-authorize or refresh token. |

**To confirm in production:**

1. At least one user has completed AliExpress Dropshipping OAuth (API Settings ? Conectar).
2. For that user, `api_credentials` has a row with `apiName = 'aliexpress-dropshipping'` and decrypted `credentials.accessToken` non-empty.
3. Orders created by that user (e.g. via PayPal capture) have `userId` set; fulfillment then uses Dropshipping API for that order.
4. Logs show `[ALIEXPRESS-AUTO-PURCHASE] Orden creada exitosamente usando Dropshipping API` and no `Usando Puppeteer para compra automática` for that flow.

---

## Summary

- **OAUTH STATUS:** Active. Tokens stored in `api_credentials`; OAuth start and callback implemented; credentials read by `CredentialsManager`.
- **API ORDER STATUS:** `executePurchase(request, userId)` uses `aliexpressDropshippingAPIService.placeOrder()` when the user has a valid `accessToken`; it does not use Puppeteer in that success path.
- **PRODUCTION STATUS:** Ready; ensure users have valid OAuth tokens in DB and orders have `userId` so fulfillment uses the Dropshipping API.

---

*End of status. Last updated: 2026-02-24.*
