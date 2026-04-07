# P16 ML Chile Issue Queues Refined

## Queue truth after P16
P16 changed the lead-path blocker map. The queues should now reflect the corrected supplier truth.

## Refined queues
- `cl_sku_no_stock_true_supplier_side`
  - Use only when raw supplier rows and normalized rows both fail to show any buyable positive-stock SKU.
- `cl_sku_no_stock_gate_false_negative`
  - Use for historical or diagnostic cases where raw SKU rows were positive but the returned product-info shape zeroed them out.
- `variant_mapping_missed_buyable_sku`
  - Use when raw or normalized rows show a buyable SKU but the selected mapping path loses it.
- `supplier_data_incomplete`
  - Use when supplier payload lacks enough SKU/logistics structure to classify safely.
- `missing_shipping_cost_after_cl_ack`
  - Use when `logistics_info_dto` acknowledges `CL`, but no real shipping method/cost lines exist.
- `near_valid_waiting_on_one_blocker`
  - Use only when a candidate is otherwise strict-safe and one hard blocker remains.

## Current dominant queue for the sampled lead path
- `missing_shipping_cost_after_cl_ack`

## Queues that moved out of first position
- `no_destination_support_cl`
- `cl_sku_no_stock_true_supplier_side`

## Operational meaning
The next sprint should no longer spend effort proving Chile support or SKU stock for this sample family. The correct narrow focus is now shipping-cost truth after Chile destination acknowledgement.
