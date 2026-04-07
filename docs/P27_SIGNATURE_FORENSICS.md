# P27 Signature Forensics

## Instrumentation added
The freight request path now returns and logs safe diagnostics for each variant:
- credential source
- token source
- canonical pre-sign parameter map
- redacted string-to-sign preview
- sign preview
- declared vs implemented algorithm match flag

## Successful signature proof
Successful request variant from the 2026-03-22 rerun:
- variant: `sync_access_token`
- endpoint: `https://api-sg.aliexpress.com/sync`
- token param: `access_token`
- sign method: `md5`
- app key prefix: `522578...`
- secret fingerprint used: `503cee3e4a68`
- string-to-sign preview:
  - `<app_secret>access_token<access_token>app_key522578formatjsonmethodaliexpress.logistics.buyer.freight.calculate...`
- algorithmMatchesDeclared:
  - `true`

## Canonical parameter map from the successful path
- `access_token` -> redacted token preview, length `68`
- `app_key` -> `522578`
- `format` -> `json`
- `method` -> `aliexpress.logistics.buyer.freight.calculate`
- `param_aeop_freight_calculate_for_buyer_d_t_o` -> JSON DTO with `country_code`, `product_id`, `product_num`, `send_goods_country_code`, `sku_id`, `price`, `price_currency`
- `sign_method` -> `md5`
- `timestamp` -> compact sync timestamp
- `v` -> `2.0`

## What failed and why
- `sync_access_token` with affiliate app key `524880...` + dropshipping token:
  - failed with `IllegalAccessToken`
  - diagnosis: binding mismatch / wrong app family
- `top_session_eco` with dropshipping app key `522578...`:
  - failed with `Invalid app Key` / `isv.appkey-not-exists`
  - diagnosis: wrong router/domain variant for this live app family
- `top_session_gw`:
  - failed by network timeout to legacy host

## Not reproduced in the fresh local rerun
- `IncompleteSignature` was not returned by the live rerun on 2026-03-22.

## Most likely explanation for the console-side IncompleteSignature
The fresh local evidence narrows the historical failure to stale mixed paths, not the successful sync path:
- stale env secret can still exist
- affiliate app secret can still be selected by bad routing if a helper is wrong
- legacy TOP router variants still generate failing freight attempts if probed

## Forensic conclusion
- Missing required signed params:
  - not on the successful sync path
- Wrong secret:
  - suspected for env fallback, not for the DB-backed successful path
- Wrong algorithm:
  - not on the successful sync path; `md5` matches implementation and succeeds
- Wrong param set:
  - not on the successful sync path
- Malformed request structure:
  - not on the successful sync path
- Wrong request path/domain variant:
  - yes, for legacy TOP router probes
