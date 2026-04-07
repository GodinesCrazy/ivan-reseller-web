# P27 Execution Report

## Objective
Replace the obsolete freight-entitlement hypothesis with a strict reconstruction of the live AliExpress freight request path and prove whether freight can be recovered at signature / binding / request-shape level.

## Work completed on 2026-03-22
- Consolidated operator-supplied console evidence for app `522578`
- Audited the freight implementation end to end
- Verified canonical routing remains `dropshipping + dropshipping_session`
- Found and fixed a code-side routing bug where `loadDropshippingCredentials()` could prefer affiliate credentials
- Added safe freight-signature diagnostics:
  - canonical param map
  - redacted string-to-sign
  - credential source
  - token source
- Reran:
  - `npm run type-check`
  - `npm run forensic:ml-chile-freight-quotes -- 1 10`
  - `npx tsx scripts/check-aliexpress-top-credential-shapes.ts 1`
  - `npm run check:ml-chile-controlled-operation -- 1`

## Main result
Outcome A is proven.

The freight request can be corrected and does return real quotes when the request uses:
- app family `dropshipping`
- app key `522578`
- dropshipping access token
- endpoint `https://api-sg.aliexpress.com/sync`
- token param `access_token`
- `md5` TOP-style signature over sorted params
- form-urlencoded body containing `param_aeop_freight_calculate_for_buyer_d_t_o`

## Live proof
- `admittedAfterFreightGate = 9`
- `freight_quote_found_for_cl = 9`
- `freight_quote_missing_for_cl = 1`
- best candidate:
  - `CAINIAO_STANDARD`
  - `0 USD`
- other successful rows returned normal non-zero quotes such as:
  - `CAINIAO_FULFILLMENT_STD / 2.99 USD`
  - `CAINIAO_STANDARD / 3.47 USD`
  - `CAINIAO_STANDARD / 3.85 USD`

## Exact remaining blockers
- env dropshipping secret does not match the DB-loaded working secret
- affiliate app + dropshipping session remains an invalid combination
- legacy TOP router probes still fail and should not be treated as the canonical path
- ML Chile strict readiness still blocked by:
  - missing ML access token / refresh token
  - `status_not_validated_ready`
  - no released-funds proof
  - no real order + supplier purchase proof

## Final status
- Freight blocker downgraded from existential to resolved-on-canonical-path.
- ML Chile remains blocked, but no longer because freight truth is unavailable.
