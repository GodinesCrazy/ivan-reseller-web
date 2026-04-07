# P14 ML Chile Issue Queues Updated

## Objective

Refine the ML Chile issue queues now that discovery has been narrowed to Chile-first supplier seeds.

## Updated Queue Reality After P14

### Supplier Discovery Queues

- `no_destination_support_cl`
  - dominant active blocker
  - P14 seed pass result: `7`
- `supplier_data_incomplete`
  - `0` in the final tighter P14 pass
- `no_cl_sku`
  - `0` because no candidate survives the earlier Chile-support gate
- `cl_sku_no_stock`
  - `0` for the same reason

### Strict Commercial Truth Queues

Broad readiness remains effectively unchanged:

- `missing_target_country_cl`
- `missing_shipping_cost`
- `missing_import_tax`
- `missing_total_cost`
- `missing_stable_aliexpress_sku`

These are still full because nothing now survives the supplier-side Chile gate.

### Near-Valid Queue

- `near_valid_waiting_on_one_blocker = 0`

## Queue Interpretation

The cleanest next queue is now obvious:

1. `no_destination_support_cl`
2. then, only after that clears, `no_cl_sku` or `cl_sku_no_stock` may matter
3. the rest of the commercial truth queues remain downstream consequences

## Auth Queue Note

Dedicated runtime auth still proves:

- `runtimeUsable = true`
- `oauthReauthRequired = false`

The broader readiness script still marks auth queues as blocked, but that is now a diagnostic inconsistency rather than the active lead blocker.

## P14 Verdict

`ISSUE QUEUE REFINEMENT = DONE`
