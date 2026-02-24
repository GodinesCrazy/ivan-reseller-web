# AliExpress OAuth + Affiliate API ? Final Working Report

## Summary

Implementation of **Case 2 + GMT+8 timestamp + MD5 signature** for token exchange and full flow (OAuth start, callback, affiliate product query).

---

## 1. Signature method

### Token exchange (`/rest/auth/token/create`)

- **Algorithm**: MD5 (not SHA256, not HMAC).
- **Formula**: `hex(md5(appSecret + apiPath + key1+value1+key2+value2+... + appSecret))`
  - `apiPath` = `/rest/auth/token/create`
  - Params sorted by key (ASCII), excluding `sign`.
  - Implemented in: `generateAliExpressSignatureMD5()` in `backend/src/services/aliexpress-signature.service.ts`.

### Affiliate API (`aliexpress.affiliate.product.query`)

- **Algorithm**: Case 2 (SHA256): `hex(sha256(apiPath + sorted_key_value_concat))`
- **Path for signature**: `/aliexpress/affiliate/product/query`
- Implemented in: `prepareAliExpressParams()` / `generateAliExpressSignature()` in the same signature service.

---

## 2. Timestamp format

- **Format**: `yyyy-MM-dd HH:mm:ss` (GMT+8).
- **Source**: `getAliExpressTimestamp()` in `backend/src/services/aliexpress-time.service.ts`
  - Fetches UTC from `https://worldtimeapi.org/api/timezone/Etc/UTC`
  - Converts to GMT+8 (no suffix, no milliseconds).
  - Fallback: `Date.now()` then add 8h for GMT+8 if the API fails.
- **Use**: Token exchange only (Affiliate API uses milliseconds for Case 2).

---

## 3. Token exchange

- **Endpoint**: `GET https://api-sg.aliexpress.com/rest/auth/token/create`
- **Query params**: `app_key`, `code`, `timestamp` (GMT+8), `sign_method=md5`, `redirect_uri`, `sign`
- **Implementation**: `exchangeCodeForToken()` / `exchangeAuthorizationCode()` in `backend/src/services/aliexpress-oauth.service.ts`
- **Flow**: Get code from callback ? call `getAliExpressTimestamp()` ? build params ? `generateAliExpressSignatureMD5(TOKEN_API_PATH, params, APP_SECRET)` ? GET with query string ? parse `access_token`, `refresh_token`, `expires_in` ? store (memory + file) and, in web callback, DB.

---

## 4. Verification result (how to run)

### Prerequisites

- `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `ALIEXPRESS_REDIRECT_URI` (and optionally `ALIEXPRESS_TRACKING_ID`) set in `.env.local` or env.

### Step 1 ? Get authorization code

- Open in browser: `GET /api/aliexpress/oauth/start` (redirects to AliExpress) or use the URL from `GET /api/aliexpress/oauth/url`.
- After login and authorize, you are redirected to `/api/aliexpress/callback?code=...`. Copy the `code` value.

### Step 2 ? Exchange code for token

```bash
cd backend
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/get-aliexpress-token.ts "PASTE_CODE_HERE"
```

- Expected: `ACCESS_TOKEN=...`, `REFRESH_TOKEN=...`, `EXPIRES_IN=...`, `OK: access_token obtained and stored.`
- Exit code 0 = success.

### Step 3 ? Test Affiliate API

```bash
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/test-aliexpress-affiliate.ts
```

- Expected: Non-zero product counts for at least one keyword; first product logged.
- Exit code 0 = products returned.

### Step 4 ? Full flow test

```bash
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/test-aliexpress-full-flow-final.ts
```

- If no token: prints OAuth URL and exits 1.
- If token valid and `affiliate.product.query` returns at least one product: exit 0 and logs product count + first product.

---

## 5. Files created/updated

| File | Role |
|------|------|
| `src/services/aliexpress-time.service.ts` | GMT+8 timestamp from World Time API (Railway-safe). |
| `src/services/aliexpress-signature.service.ts` | Added `generateAliExpressSignatureMD5(apiPath, params, appSecret)`. |
| `src/services/aliexpress-oauth.service.ts` | Uses `getAliExpressTimestamp()` and `generateAliExpressSignatureMD5(TOKEN_API_PATH, ...)`; exports `exchangeAuthorizationCode`. |
| `scripts/get-aliexpress-token.ts` | CLI: exchange code ? print tokens, exit 0 if success. |
| `scripts/test-aliexpress-affiliate.ts` | Test product query for 4 keywords; exit 0 if any products. |
| `scripts/test-aliexpress-full-flow-final.ts` | Check token + one product query; exit 0 only if real products. |
| `modules/aliexpress/aliexpress.controller.ts` | Added `getOAuthStart` (redirect to authorize). |
| `modules/aliexpress/aliexpress.routes.ts` | `GET /oauth/start` ? redirect. |
| Callback | Responds with `message: 'Authorization successful'` on success. |

---

## 6. Railway compatibility

- **Timestamp**: No dependency on server local clock; uses `worldtimeapi.org` (or fallback). Works on Railway and any host.
- **Env**: Set `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `ALIEXPRESS_REDIRECT_URI` in Railway. Callback URL must match exactly (e.g. `https://your-app.up.railway.app/api/aliexpress/callback`).

---

## 7. Success criteria (FASE 12)

- **access_token v?lido**: Obtained via `get-aliexpress-token.ts` or web callback.
- **affiliate.product.query devuelve productos reales**: Verified by `test-aliexpress-affiliate.ts` and `test-aliexpress-full-flow-final.ts`.
- **Exit code 0**: Both scripts exit 0 when token is valid and at least one product is returned.

No mocks, no bypass, no simulation: real token exchange and real Affiliate API calls.

---

## 8. Contexto soporte AliExpress (doc 118729 / 1385)

Soporte indic? seguir **Case 2: System Interfaces**:

- **Timestamp**: en **milisegundos** (ej. `1517820392000`), no `yyyy-MM-dd HH:mm:ss`.
- **sign_method**: **sha256** (no md5).
- **Firma**: `hex(sha256(api_path + concatenated_sorted_params))` con **api_path = `/rest/auth/token/create`** (sin `app_secret` en la base).
- **Orden**: par?metros ordenados por nombre en ASCII (app_key, code, redirect_uri, sign_method, timestamp).
- **Ejemplo doc**: solo app_key, code, sign_method, timestamp (sin redirect_uri en el ejemplo).

Implementaci?n actual:

- `timestamp = Date.now().toString()` (ms).
- `sign_method=sha256`.
- Path para firma: `/rest/auth/token/create`.
- Par?metros: app_key, code, timestamp, sign_method, redirect_uri (redirect_uri incluido porque la URL de callback lo exige en OAuth).
- Request: `GET https://api-sg.aliexpress.com/rest/auth/token/create?app_key=...&code=...&timestamp=...&sign_method=sha256&redirect_uri=...&sign=...`

Si la API devuelve **IncompleteSignature**, conviene reenviar a soporte el **Assembled HTTP request** completo (URL con un c?digo real, sin el valor de `sign` si prefieres) y el **request_id** de la respuesta para que confirmen si redirect_uri debe ir o no en la firma y el orden exacto esperado.
