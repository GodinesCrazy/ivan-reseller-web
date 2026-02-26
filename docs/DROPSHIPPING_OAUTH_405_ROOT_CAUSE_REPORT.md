# AliExpress Dropshipping OAuth 405 Root Cause Report

## Final diagnosis

The `405 Method Not Allowed` was caused by a malformed token exchange request format to `https://auth.aliexpress.com/oauth/token`:

- Request body was sent as JSON in parts of the flow.
- Header/body were not consistently aligned with AliExpress OAuth expectations.
- `redirect_uri` could differ between authorization URL generation and callback token exchange.

AliExpress expects:

- `POST` method
- `Content-Type: application/x-www-form-urlencoded`
- body encoded via URL form fields (`grant_type`, `client_id`, `client_secret`, `code`, `redirect_uri`)
- exact same `redirect_uri` used in both auth and token exchange

## Applied corrective actions

1. Enforced `application/x-www-form-urlencoded` payload in Dropshipping token exchange methods.
2. Added explicit diagnostics for token endpoint, headers, and HTTP status in OAuth exchange logs.
3. Standardized a single canonical redirect URI using:
   - `backend/src/utils/aliexpress-dropshipping-oauth.ts`
   - `getAliExpressDropshippingRedirectUri()`
4. Updated both route flows to use canonical redirect:
   - `backend/src/api/routes/marketplace.routes.ts`
   - `backend/src/api/routes/marketplace-oauth.routes.ts`
5. Added direct reproduction script for controlled test outside UI callback flow:
   - `backend/scripts/test-dropshipping-token-exchange.ts`

## Verification protocol

From `backend`:

```bash
npx tsx scripts/test-dropshipping-token-exchange.ts "<REAL_OAUTH_CODE>"
```

Expected result:

- No `405`.
- Response with valid token payload (or a deterministic OAuth validation error if code is expired/invalid).

## Conclusion

The root cause has been isolated and corrected at protocol level (content type + encoding + redirect URI consistency). Remaining OAuth errors, if any, should now be related to credential validity, code expiration, or AliExpress-side app permissions rather than transport/request formatting.
