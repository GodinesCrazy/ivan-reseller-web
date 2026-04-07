# P18 ML Chile Issue Queues Refined

## Queue truth after P18
P18 broadened the tested AliExpress discovery profile and still found no shipping-rich Chile pattern in the live admitted set.

## Refined queues
- `shipping_rich_pattern_found`
  - use only if a candidate family produces at least one Chile-supported, CL-SKU-buyable row with real shipping method/cost truth
- `shipping_rich_pattern_not_found`
  - use when a tested family produces admitted Chile rows but none survive the shipping-cost gate
- `missing_shipping_cost_true_supplier_side`
  - use when destination acknowledgement exists but no real shipping method/cost lines are exposed
- `free_shipping_acknowledged_but_not_normalized`
  - use only when supplier payload explicitly signals free shipping but the normalized path still fails to expose it
- `missing_import_tax_after_shipping`
  - use once a candidate clears the shipping-cost gate but import tax remains unresolved
- `missing_total_cost_after_shipping`
  - use once a candidate clears shipping and import-tax truth but total cost is still unresolved
- `near_valid_waiting_on_one_blocker`
  - use only for candidates that are otherwise strict-safe and down to one blocker

## Current dominant queue
- `shipping_rich_pattern_not_found`
- `missing_shipping_cost_true_supplier_side`

## Queues moved out of first position
- `no_destination_support_cl`
- `cl_sku_no_stock_true_supplier_side`
