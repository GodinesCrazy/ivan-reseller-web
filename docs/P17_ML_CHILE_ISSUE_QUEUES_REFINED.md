# P17 ML Chile Issue Queues Refined

## Queue truth after P17
P17 proved that the dominant blocker is now shipping-cost truth, not Chile support or CL-SKU stock.

## Refined queues
- `missing_shipping_cost_true_supplier_side`
  - use when supplier payload acknowledges `CL` but exposes no real shipping method/cost lines
- `missing_shipping_cost_gate_false_negative`
  - use only when raw supplier payload contains shipping-cost truth that the normalized path failed to extract
- `shipping_method_present_but_cost_unparsed`
  - use when method structure exists but the cost value is not normalized into a usable amount
- `free_shipping_acknowledged_but_not_normalized`
  - use when supplier payload indicates free shipping but the normalized path does not expose that truth
- `missing_import_tax_after_shipping`
  - use once shipping-cost truth exists but import tax is still unresolved
- `missing_total_cost_after_shipping`
  - use once shipping-cost truth exists but total cost is still unresolved
- `near_valid_waiting_on_one_blocker`
  - use only when a candidate is otherwise strict-safe and exactly one hard blocker remains

## Current dominant queue
- `missing_shipping_cost_true_supplier_side`

## Queues moved out of first position
- `no_destination_support_cl`
- `cl_sku_no_stock_true_supplier_side`
- `variant_mapping_missed_buyable_sku`
