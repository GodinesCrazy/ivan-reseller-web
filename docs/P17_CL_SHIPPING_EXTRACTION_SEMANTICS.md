# P17 CL Shipping Extraction Semantics

## Goal
Audit whether the current `missing_shipping_cost` blocker is caused by bad extraction semantics or by genuine supplier-side absence of shipping-cost truth.

## Observed runtime shape
From the live forensic pass:
- `logistics_info_dto` exists
- its only visible keys are `delivery_time` and `ship_to_country`
- `normalizedShippingMethodCount = 0` for all `8/8` sampled candidates
- `normalizedShippingMethods = []` for all `8/8` sampled candidates

## Semantics audit result
The current extraction path is not the main blocker for the sampled set.

Why:
- there are no normalized shipping methods to parse
- there are no visible shipping-cost rows to persist
- there are no visible free-shipping markers to normalize
- there are no visible method identifiers to map

## Safe conclusion
`missing_shipping_cost` is correct for the sampled Chile-admitted set.

This is not the same kind of false negative as P16.
P16 failed because raw supplier-side stock truth existed and was lost during SKU normalization.
P17 does not show equivalent hidden shipping-cost truth in the inspected live payload.

## New explicit classification
The dominant queue after P17 should be treated as:
- `missing_shipping_cost_true_supplier_side`

## No unsafe fix applied
No shipping-cost value was fabricated.
No zero-cost assumption was introduced.
No total-cost inference was allowed without real shipping-cost truth.
