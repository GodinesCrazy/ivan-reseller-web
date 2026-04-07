# P21 App / Session Pair Audit

## Objective
Audit which AliExpress credential combinations are actually eligible for buyer freight calls.

## Live Credential Shapes
### `aliexpress-affiliate`
- App key present
- Access token absent
- Refresh token absent
- Not currently usable for a session-required freight call

### `aliexpress-dropshipping`
- App key present
- Access token present
- Refresh token present
- Reaches the freight endpoint, but the app key is rejected there

## Strategy Audit
### `dropshipping_native`
- App family: `dropshipping`
- Token family: `dropshipping_session`
- Result: endpoint reached, but rejected with `Invalid app Key`
- Classification: `freight_endpoint_incompatible`

### `affiliate_app_with_dropshipping_session`
- App family: `affiliate`
- Token family: `dropshipping_session`
- Result: invalid freight pairing
- Classification: `freight_app_session_mismatch`

### `affiliate_app_without_session`
- App family: `affiliate`
- Token family: `none`
- Result: no valid freight session path
- Classification: `freight_endpoint_incompatible`

## Conclusion
The current repo does not contain a proven freight-capable app/session pair.
The highest-confidence live diagnosis is that the current dropshipping app is not entitled or not recognized for `aliexpress.logistics.buyer.freight.calculate`, while the affiliate app lacks the required session path.
