# P22 AliExpress Freight Entitlement Audit

## Objective
Determine whether `aliexpress.logistics.buyer.freight.calculate` is available to the currently stored AliExpress app/session architecture.

## Hard Runtime Evidence
- The freight endpoint is reached live.
- Transport, signing, and request routing are no longer the blocker.
- The native dropshipping freight path fails with:
  - `code = 29`
  - `sub_code = isv.appkey-not-exists`
  - `msg = Invalid app Key`

## Compatibility Matrix

| Method | App family | Token/session family | Observed result | Classification |
| --- | --- | --- | --- | --- |
| `aliexpress.logistics.buyer.freight.calculate` | `dropshipping` | `dropshipping_session` | Endpoint reached, app key rejected | `freight_endpoint_incompatible` |
| `aliexpress.logistics.buyer.freight.calculate` | `affiliate` | `dropshipping_session` | Cross-family pairing rejected | `freight_app_session_mismatch` |
| `aliexpress.logistics.buyer.freight.calculate` | `affiliate` | `none` | No session path for buyer freight | `freight_endpoint_incompatible` |

## Evidence-Backed Diagnosis
The remaining blocker is no longer inside candidate discovery, Chile support, SKU truth, or freight normalization.

The strongest diagnosis is:
- the current dropshipping app family is not freight-entitled or not recognized for this method
- the affiliate app family is not a valid fallback because it lacks the required session model
- cross-family app/session mixing is not a legitimate recovery path

## Final Entitlement Conclusion
The freight blocker is now best classified as an external platform entitlement or app provisioning dependency, not a normal code bug.
