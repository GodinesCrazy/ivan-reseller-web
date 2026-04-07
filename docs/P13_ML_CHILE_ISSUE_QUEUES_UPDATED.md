# P13 ML Chile Issue Queues Updated

## Objective

Refine the ML Chile issue queues so the next sprint can focus on the exact remaining blocker set after P13.

## Updated Queue Set

- `auth_blocked_ml`
- `oauth_reauth_required_ml`
- `no_destination_support_cl`
- `supplier_data_incomplete`
- `no_cl_sku`
- `cl_sku_no_stock`
- `missing_target_country_cl`
- `missing_shipping_cost`
- `missing_import_tax`
- `missing_total_cost`
- `missing_stable_aliexpress_sku`
- `near_valid_waiting_on_one_blocker`

## Fresh Queue Truth After P13

### Auth Queues

Dedicated runtime auth proof now says:

- `auth_blocked_ml = false`
- `oauth_reauth_required_ml = false`

But the broader readiness script still reports the older auth classification. That queue inconsistency should be treated as diagnostic debt, not as the lead business blocker.

### Discovery And Supplier Queues

From the clean P13 discovery pass:

- `no_destination_support_cl = 10`
- `supplier_data_incomplete = 1`
- `no_cl_sku = 0` at this stage because no candidate survives the earlier Chile-support gate
- `cl_sku_no_stock = 0` at this stage for the same reason

### Commercial Truth Queues

From broad readiness recheck:

- `missing_target_country_cl` remains materially full
- `missing_shipping_cost` remains materially full
- `missing_import_tax` remains materially full
- `missing_total_cost` remains materially full
- `missing_stable_aliexpress_sku` remains materially full
- `near_valid_waiting_on_one_blocker = 0`

## Business Interpretation

The ML Chile queue picture is now cleaner:

1. runtime auth has effectively moved out of the lead blocker position
2. the dominant active operational queue is now `no_destination_support_cl`
3. the next sprint should target Chile-capable supplier discovery, not more generic enrichment

## P13 Verdict

`ISSUE QUEUE UPDATE = DONE`
