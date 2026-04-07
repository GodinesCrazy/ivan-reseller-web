# P24 Freight Capability Isolation

## Objective
Treat freight as a first-class capability instead of a generic side effect of dropshipping readiness.

## Explicit Truth After P24
- `dropshippingProductCapability`: usable
- `freightQuoteCapability`: not usable

## Why This Matters
Before this refactor, the business could still misread freight failure as:
- generic shipping extraction failure
- weak discovery family quality
- blended AliExpress provider instability

After P24, freight is isolated and reported as:
- `freight_entitlement_missing`
- `freight_endpoint_incompatible`

## ML Chile Meaning
ML Chile pre-sale readiness now depends specifically on `freightQuoteCapability`, not on generic AliExpress viability.
