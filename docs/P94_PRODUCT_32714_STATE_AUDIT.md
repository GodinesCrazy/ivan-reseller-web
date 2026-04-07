# P94 — Product 32714 state audit

## Scope
Operational audit focused only on `Product.id=32714` (`AliExpress 1005009130509159`) with variant path `first-in-stock/white`.

## Runtime evidence used
- `artifacts/p94-product-32714-unblock.json`
- `artifacts/p92/p92-resolution.json` (latest rerun)
- code guards in `backend/src/services/mercadolibre-publish-preflight.service.ts`

## Current state (observed)
- `status`: `PENDING`
- `isPublished`: `false`
- `targetCountry`: `CL`
- `aliexpressSku`: `12000048020865799`
- `shippingCost/importTax/totalCost`: all `null`
- `reconciledTruth.hasMachineVerifiableContext`: `false`

## Exact reason for `blocked_product_status`
`buildMercadoLibrePublishPreflight` enforces:
- product must be `VALIDATED_READY`
- if not, blocker is emitted: `product_status:PENDING (required VALIDATED_READY)`

Observed preflight blockers:
- `product_status:PENDING (required VALIDATED_READY)`
- `mercadolibre_test_connection_failed`
- `images:ml_canonical_dual_gate_failed_all_candidates_and_remediations`
- `pricing:product not in VALIDATED_READY`

## Blocker class
Primary status blocker is not arbitrary UI state; it is caused by missing preventive preparation outputs required to justify `VALIDATED_READY`:
- missing persisted CL freight truth (`mlChileFreight`)
- missing machine-verifiable publish context (`shippingCost`, `totalCost`)
- image remediation unresolved
- ML API connection not healthy

## Classification
- `blocked_product_status` class: **missing preparation + missing machine-verifiable context**
- not a valid case for manual status forcing
