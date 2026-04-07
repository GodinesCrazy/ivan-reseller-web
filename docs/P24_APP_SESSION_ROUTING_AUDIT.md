# P24 App Session Routing Audit

## Objective
Make invalid AliExpress app/session combinations impossible by design for normal capability routing.

## Canonical Routing Rules
- `affiliateDiscoveryCapability -> affiliate + none`
- `dropshippingProductCapability -> dropshipping + dropshipping_session`
- `dropshippingOrderCapability -> dropshipping + dropshipping_session`
- `freightQuoteCapability -> dropshipping + dropshipping_session`

## Invalid Combinations Explicitly Rejected
- `affiliate + dropshipping_session` for freight
- `affiliate + none` for freight
- any hidden fallback that pretends freight can inherit affiliate discovery credentials

## Live Audit Truth
The freight forensic rerun still shows:
- `dropshipping_native = freight_endpoint_incompatible`
- `affiliate_app_with_dropshipping_session = freight_app_session_mismatch`
- `affiliate_app_without_session = freight_endpoint_incompatible`

## Result
Routing ambiguity is reduced.
The only valid freight route is now explicit, and it remains externally blocked.
