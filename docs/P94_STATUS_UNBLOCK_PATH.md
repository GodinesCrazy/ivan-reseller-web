# P94 — Status unblock path for Product 32714

## Canonical transition target
`PENDING -> VALIDATED_READY` only after preventive path succeeds and persisted operational truth exists.

## Attempted unblock path (executed)
1. Reused existing product row `32714` (no recreation).
2. Executed preventive preparation attempt via `prepareProductForSafePublishing`.
3. Preventive attempt failed, so no status promotion was applied.

## Why status was not changed
The preventive step failed with:
`Product not valid for publishing: persisted ML Chile freight truth is not ready for publish: persisted mlChileFreight metadata is missing`

Because of that failure, advancing status would bypass fail-closed intent.

## Before vs after
- Before: `PENDING`
- After: `PENDING`
- Rationale: no valid preventive output to support honest `VALIDATED_READY`.

## Minimum correct unblock path (next)
1. Persist ML Chile freight truth metadata for `32714` (`mlChileFreight` required by preventive economics).
2. Re-run preventive preparation and persist outputs (`shippingCost`, `importTax`, `totalCost`, `preventivePublish`).
3. Re-run preflight; only then allow status to move to `VALIDATED_READY`.
