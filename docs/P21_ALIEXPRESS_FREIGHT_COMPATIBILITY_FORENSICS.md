# P21 AliExpress Freight Compatibility Forensics

## Objective
Determine whether the current AliExpress app/session architecture can call `aliexpress.logistics.buyer.freight.calculate` for the ML Chile lead path.

## Confirmed Runtime Truth
- The live freight endpoint is reached successfully.
- The request is no longer failing on router path or incomplete signature.
- The current dominant live failure is:
  - `code = 29`
  - `sub_code = isv.appkey-not-exists`
  - `msg = Invalid app Key`

## Request Path Audited
- Method: `aliexpress.logistics.buyer.freight.calculate`
- Transport: TOP router REST endpoint
- Signing: stable enough to reach the endpoint
- Session: provided when using the dropshipping credential family
- DTO path: explicit freight-calculation payload for buyer freight

## Compatibility Diagnosis
The current freight blocker is not a discovery or SKU blocker. It is a credential compatibility blocker.

The strongest runtime evidence is:
- `dropshipping_native` reaches the freight endpoint with a live session token, but the app key is rejected as invalid for the freight method.
- `affiliate_app_with_dropshipping_session` also fails, which shows cross-family pairing is not a valid workaround.
- `affiliate_app_without_session` is structurally unusable for buyer freight because the call requires a session-capable auth path.

## Final Classification
- Freight endpoint compatibility status: `freight_endpoint_incompatible`
- Stronger narrower sub-case for cross-family fallback: `freight_app_session_mismatch`

## Business Meaning
ML Chile is blocked before real shipping-cost truth can be persisted.
Until a freight-capable AliExpress app/session pair exists, the strict funnel cannot move past `missing_shipping_cost`.
