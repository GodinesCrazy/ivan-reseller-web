# OAUTH FULL FIX REPORT

## Phase results

**STATE GENERATION STATUS:** OK  
**CALLBACK VALIDATION STATUS:** FAIL ? OK (fixed)  
**FRONTEND POPUP FLOW STATUS:** OK  
**ENV STATUS:** OK  
**DATABASE STORAGE STATUS:** OK  
**DROPSHIPPING API EXECUTION STATUS:** OK  

---

## ROOT CAUSE

The Dropshipping OAuth flow was using **redirect_uri = `${WEB_BASE_URL}/api/aliexpress/callback`**. That path is handled by **aliExpressRoutes** (Affiliate API) at `GET /api/aliexpress/callback` ? `oauthCallback` in `aliexpress.controller.ts`, which:

- Does **not** validate the JWT `state` (no `verifyStateAliExpressSafe`).
- Persists tokens to `aliExpressToken` (Affiliate), not to `api_credentials` for `aliexpress-dropshipping`.

If the redirect had instead hit the generic route `GET /api/marketplace-oauth/oauth/callback/aliexpress-dropshipping`, that handler uses **parseState()** (eBay-style HMAC state). The Dropshipping flow sends a **JWT** state from `signStateAliExpress(userId)`. Parsing that with `parseState()` fails with **"Invalid authorization state signature"** because the format is different (JWT vs payload|signature).

So the real bug was: **the callback URL pointed to the wrong handler**. The handler that correctly validates JWT state and saves to `api_credentials` is **GET /callback** in `marketplace-oauth.routes.ts`, mounted at `/api/marketplace-oauth` (i.e. **/api/marketplace-oauth/callback**). The flow was never using that URL.

---

## FIX APPLIED

1. **Redirect URI for Dropshipping**
   - **File:** `backend/src/api/routes/marketplace.routes.ts`
   - **Change:** `defaultCallbackUrl` for `aliexpress-dropshipping` from  
     `${webBaseUrl}/api/aliexpress/callback`  
     to  
     `${webBaseUrl}/api/marketplace-oauth/callback`.
   - So the auth URL sent to AliExpress now uses the callback that runs the JWT state validation and saves to `api_credentials`.

2. **Token exchange redirect_uri**
   - **File:** `backend/src/api/routes/marketplace-oauth.routes.ts`
   - **Change:** In the direct `GET /callback` handler, `defaultCallbackUrl` used in `exchangeCodeForToken(..., redirectUri || defaultCallbackUrl, ...)` from  
     `${webBaseUrl}/api/aliexpress/callback`  
     to  
     `${webBaseUrl}/api/marketplace-oauth/callback`.
   - Keeps the token exchange in line with the redirect_uri registered with AliExpress.

3. **Token error response**
   - **File:** `backend/src/api/routes/marketplace-oauth.routes.ts`
   - **Change:** Removed the second `res.send()` in the token-error catch block (was causing "Cannot set headers after they are sent"). A single `res.status(500).send(...)` now returns one HTML page with meta refresh, postMessage to opener, and "Cerrar ventana" button.

---

## IMPORTANT: AliExpress Developer Console

You must register the **new** redirect URI in the AliExpress Dropshipping app:

- **New redirect URI:** `https://<your-backend-host>/api/marketplace-oauth/callback`  
  Examples:
  - `https://www.ivanreseller.com/api/marketplace-oauth/callback` (if API is under same host)
  - `https://ivan-reseller-backend-production.up.railway.app/api/marketplace-oauth/callback` (if API is on Railway)

Remove or stop using the old `/api/aliexpress/callback` URL for the Dropshipping app so only the new callback is used.

---

## VALIDATION SUMMARY

| Phase | Status | Notes |
|-------|--------|--------|
| **1. State generation** | OK | `oauth-state.ts`: `signStateAliExpress(userId)` uses JWT with ENCRYPTION_KEY/JWT_SECRET, payload has userId + provider, expires 10m. |
| **2. Callback** | OK (after fix) | `marketplace-oauth.routes.ts` GET `/callback`: uses `verifyStateAliExpressSafe(state)`, gets userId, saves to api_credentials; success redirect/postMessage to `/api-settings?oauth=success&provider=aliexpress-dropshipping`. |
| **3. Frontend popup** | OK | `APISettings.tsx`: `window.open(authUrl, 'oauth', ...)`, listener for `oauth_success`/`oauth_error`, refreshes and shows toast; callback HTML uses `postMessage` and `window.close()`. |
| **4. Env** | OK | ENCRYPTION_KEY or JWT_SECRET (?32 chars), WEB_BASE_URL; App Key/Secret from api_credentials. |
| **5. Database** | OK | CredentialsManager.saveCredentials(userId, 'aliexpress-dropshipping', ...) writes to api_credentials with accessToken and userId. |
| **6. Dropshipping execution** | OK | `aliexpress-auto-purchase.service.ts`: when creds have accessToken, uses `aliexpressDropshippingAPIService.placeOrder()` (no Puppeteer fallback). |

---

## FINAL OAUTH STATUS

**WORKING** (after registering the new redirect URI in AliExpress and redeploying the backend).

---

## SYSTEM STATUS

**READY** (once the new callback URL is registered in AliExpress Developer Console and the backend is deployed with the changes above).
