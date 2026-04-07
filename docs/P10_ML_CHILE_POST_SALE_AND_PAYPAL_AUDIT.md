# P10 ML Chile Post-Sale And PayPal Audit

Date: 2026-03-21

## Classification Matrix

| Stage | Classification | Evidence |
| --- | --- | --- |
| 1. ML Chile order ingestion | Code-only to runtime-partial | architecture exists, but ML runtime sync still fails with `401 invalid access token` and there are zero ML orders in DB |
| 2. Order truth classification | Operationally usable | order-truth flags and cancellation exclusion are already strong |
| 3. Exclusion of invalid/cancelled proof | Operationally usable | existing truth model blocks false commercial proof |
| 4. ML order -> supplier payload conversion | Runtime-partial | fulfillment service can map order data to supplier purchase payload, but not proven on an ML Chile order |
| 5. AliExpress purchase execution readiness | Runtime-partial | purchase orchestration exists, but no ML Chile order has traversed it |
| 6. Payment path toward supplier | Code-only to runtime-partial | supplier purchase exists; supplier payment completion remains unproven |
| 7. Shipping/tracking truth | Runtime-partial | tracking layer exists, but latest sync runs still showed errors and zero updates |
| 8. Delivered/received truth | Runtime-partial | sale states exist, but no ML Chile commercial proof exists |
| 9. Marketplace released-funds visibility | Code-only | payout fields and sale states exist, but no ML Chile released-funds event has been proven |
| 10. Realized net-profit recognition | Operationally usable in engine, commercially unproven | profit engine is conservative, but no ML Chile row qualifies yet |

## Controlled-Test PayPal Path

### What exists

- fulfillment orchestration
- purchase retry flow
- AliExpress purchase service
- PayPal payout services

### What remains incomplete

- supplier-side payment completion is still not a commercially proven success state
- no ML Chile order has proven `order -> supplier purchase -> supplier payment -> shipment`

### Mis-purchase Prevention

Current strengths:

- URL resolution is guarded
- SKU selection is guarded
- capital checks exist
- stale supplier SKU blocks fulfillment instead of guessing

Current weakness:

- there is still no proven ML Chile order exercising this path

## Conclusion

Post-sale truth is safer than average.
Supplier payment proof is still a first-class blocker to the first real controlled profitable operation.
