# P17 Execution Report

## Sprint scope
P17 was a narrow shipping-cost forensics sprint for the ML Chile lead path.

It did not broaden into:
- post-sale automation
- new marketplaces
- new suppliers
- weaker validation

## Implemented changes
- Added `backend/src/utils/ml-chile-shipping-gate.ts`
- Added `backend/src/utils/ml-chile-shipping-gate.test.ts`
- Added `backend/scripts/forensic-ml-chile-shipping-cost.ts`
- Added npm entrypoint `forensic:ml-chile-shipping-cost`
- Produced the full P17 report set

## What P17 proved
- The current admitted Chile-first set does not expose usable shipping-cost truth.
- Live supplier payloads acknowledge `CL` but only surface:
  - `delivery_time`
  - `ship_to_country`
- No real shipping methods or costs were normalized for the sampled set.

## What P17 did not prove
- It did not prove a shipping-cost extraction false negative comparable to the P16 SKU false negative.
- It did not produce a strict `VALIDATED_READY` ML Chile candidate.

## New blocker hierarchy
1. `missing_shipping_cost_true_supplier_side`
2. `missing_import_tax_after_shipping`
3. `missing_total_cost_after_shipping`
4. no strict `VALIDATED_READY` candidate yet

## Readiness note
`check:ml-chile-controlled-operation` still reports stale ML auth state. That remains a diagnostic inconsistency, but it is not the lead blocker for P17. The decisive blocker is shipping-cost truth.
