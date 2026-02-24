# AliExpress Working Integration Report ? Case 2: System Interfaces

## 1. Signature algorithm (Case 2)

**Rule:** Signature base string = `api_path` + concatenated sorted parameters (keys and values, no separators). Do NOT prepend or append `app_secret`.

**Example for token create:**

- `api_path` = `/rest/auth/token/create`
- Params (ASCII order): `app_key`, `code`, `sign_method`, `timestamp`
- Concatenation (no separators): `app_key524880codeAUTHCODEsign_methodsha256timestamp1517820392000`

**Signature base string example:**

```
/rest/auth/token/createapp_key524880code3_524880_XXXXsign_methodsha256timestamp1771282730765
```

**Generated signature:** `hex(sha256(signature_base_string)).toUpperCase()`  
Example: `D891A5E254D4D920DE974BFBD836E495AF66A62336E8E12AC8531CE916630718`

**Debug logs:** The service prints `SIGN_BASE_STRING:` and `SIGN_GENERATED:` on each token request.

---

## 2. Token request format

**Method:** GET only.

**URL:**

```
https://api-sg.aliexpress.com/rest/auth/token/create?app_key=...&code=...&sign_method=sha256&timestamp=...&redirect_uri=...&sign=...
```

**Rules:**

- `timestamp` = `Date.now().toString()` (milliseconds).
- `redirect_uri` is NOT included in the signature base; it MAY be sent in the URL (after other params).
- `sign` must be the last query parameter.
- All parameter values are URL-encoded.

**Implementation:** `backend/src/services/aliexpress-oauth.service.ts` ? `exchangeCodeForToken()`.

---

## 3. Affiliate API (Case 2)

**Method:** POST to `https://api-sg.aliexpress.com/sync`  
**Signature path:** `/aliexpress/affiliate/product/query`  
**Signature base example:**

```
/aliexpress/affiliate/product/queryaccess_token...app_key...keywordsphone case...timestamp...
```

Same Case 2 formula: `api_path` + sorted key/value concatenation (no `app_secret` in base).  
**Implementation:** `backend/src/services/aliexpress-affiliate-api.service.ts` ? `makeRequest()` uses `prepareAliExpressParams(signaturePath, stringParams, appSecret)`.

---

## 4. Verification script

**Script:** `backend/scripts/test-aliexpress-full-flow.ts`

**Usage:**

```bash
cd backend
npx tsx scripts/test-aliexpress-full-flow.ts "AUTHORIZATION_CODE"
```

**Steps:**

1. If no code: prints OAuth URL and exits 1; user opens URL and pastes code.
2. Exchange code for token (Case 2 GET).
3. Verify `access_token` exists.
4. Call `aliexpress.affiliate.product.query` for: `phone case`, `wireless earbuds`, `usb charger`, `led strip`.
5. Exit 0 only if at least one keyword returns `products.length > 0`.

**Expected output on success:**

- `ACCESS TOKEN RECEIVED`
- `AFFILIATE PRODUCTS RECEIVED`
- `VERIFICATION SUCCESS`

---

## 5. Fail-safe (token failure)

On token exchange failure the service logs:

- **SIGN_BASE_STRING:** (from signature service)
- **TOKEN REQUEST URL (full):** exact URL used
- **API RESPONSE:** full response body

No mocks; strict Case 2 only.

---

## 6. If token returns IncompleteSignature

The integration uses the exact Case 2 formula from doc 118729/1385. If the API still returns `IncompleteSignature`, send to support:

- The printed **SIGN_BASE_STRING** (full string).
- The full **TOKEN REQUEST URL** (with code/sign redacted if needed).
- The **request_id** from the response.

Ask them to confirm: (1) the exact `api_path` for the signature (must be `/rest/auth/token/create` to match endpoint), (2) whether all query parameters must be included in the signature in the same order (ASCII), (3) whether the signature must be lowercase hex.
