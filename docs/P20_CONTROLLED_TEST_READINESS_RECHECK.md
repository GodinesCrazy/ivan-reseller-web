# P20 Controlled Test Readiness Recheck

## Decision
`NOT READY`

## Why
- No ML Chile candidate survived the freight gate in live runtime.
- `strictMlChileReadyCount` remains `0`.
- `missingShippingCost`, `missingImportTax`, and `missingTotalCost` remain effectively full at readiness scale.
- No ML Chile order/sale/released-funds proof exists.

## Exact P20 Blocker
- Freight integration is now implemented.
- The live blocker is:
  - `aliexpress.logistics.buyer.freight.calculate` rejects the currently usable dropshipping session/app pair with `Invalid app Key`
  - the affiliate app key path is present but has no session/access token for the required buyer-freight call

## Readiness Classification
- Not blocked by Chile destination support
- Not blocked by CL SKU buyability
- Not blocked by shipping-cost extraction semantics
- Blocked by AliExpress freight endpoint credential/app compatibility
