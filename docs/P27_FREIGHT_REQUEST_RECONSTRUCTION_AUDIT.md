# P27 Freight Request Reconstruction Audit

## Files audited
- `backend/src/services/aliexpress-dropshipping-api.service.ts`
- `backend/src/services/pre-publish-validator.service.ts`
- `backend/src/services/credentials-manager.service.ts`
- `backend/scripts/forensic-ml-chile-freight-quotes.ts`
- `backend/scripts/check-aliexpress-top-credential-shapes.ts`

## Exact freight method path
- Exact method name:
  - `aliexpress.logistics.buyer.freight.calculate`
- Working base URL:
  - `https://api-sg.aliexpress.com/sync`
- Legacy probe URLs still present for forensics:
  - `https://gw.api.taobao.com/router/rest`
  - `https://eco.taobao.com/router/rest`

## Working runtime request shape
- App family:
  - `dropshipping`
- App key source used in successful rerun:
  - credentials-manager `aliexpress-dropshipping` user credential row
- Token source used in successful rerun:
  - credentials-manager `aliexpress-dropshipping:accessToken`
- Token parameter on working route:
  - `access_token`
- Timestamp shape on working route:
  - compact sync format, example `20260322T22430900`
- Sign method declared and used:
  - `md5`
- DTO parameter:
  - `param_aeop_freight_calculate_for_buyer_d_t_o`

## Exact signed parameter set on the successful path
ASCII-sorted keys, excluding `sign`:
- `access_token`
- `app_key`
- `format`
- `method`
- `param_aeop_freight_calculate_for_buyer_d_t_o`
- `sign_method`
- `timestamp`
- `v`

## Canonicalization and null handling
- Param ordering is alphabetical by key.
- `sign` is excluded from the string-to-sign.
- `undefined`, `null`, and blank-string values are skipped before form-body append.
- The DTO is JSON-stringified before signing and before body placement.
- Request placement is `application/x-www-form-urlencoded` form body, not query string.

## String-to-sign shape
- Working path uses TOP-style MD5 bookends:
  - `appSecret + sorted(key+value...) + appSecret`
- Example redacted preview from the successful rerun:
  - `<app_secret>access_token<access_token>app_key522578formatjsonmethodaliexpress.logistics.buyer.freight.calculate...`

## Comparison against other working DS signing patterns
- The shared DS `makeRequest()` path also uses:
  - `https://api-sg.aliexpress.com/sync`
  - `access_token`
  - `md5`
  - sorted TOP-style signing
- This means the successful freight path matches the working DS request family.
- The failing legacy probes differ in exactly the places that are now suspect:
  - router domain
  - `session` token param
  - TOP timestamp shape

## Audit conclusion
- Outcome A is proven: the freight request can be constructed in a working way and return a real quote.
- The exact working freight route is:
  - `dropshipping_native -> api-sg /sync -> access_token -> md5 -> form-urlencoded DTO body`
- The failing routes are legacy forensic probes, not the working freight path.
