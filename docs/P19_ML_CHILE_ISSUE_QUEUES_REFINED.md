# P19 ML Chile Issue Queues Refined

## Queue truth after P19
P19 showed that broader discovery families still do not reach a shipping-rich seller/logistics pattern for Chile.

## Refined queues
- `shipping_rich_seller_pattern_found`
  - use only when a seller/logistics pattern produces at least one Chile-supported, CL-SKU-buyable row with real shipping method/cost truth
- `shipping_rich_seller_pattern_not_found`
  - use when tested seller/logistics patterns still produce zero candidates surviving the shipping-cost gate
- `missing_shipping_cost_true_supplier_side`
  - use when Chile is acknowledged but no real shipping method/cost truth is exposed
- `seller_pattern_shipping_poor_for_cl`
  - use when seller/store/package structures exist but the logistics payload remains limited to destination acknowledgement
- `likely_rut_required_for_supplier_checkout`
  - use when Chile-specific RUT/tax-ID handling is not yet modeled but is likely needed later for real supplier checkout realism
- `missing_import_tax_after_shipping`
  - use once shipping truth exists but import tax still blocks total cost
- `missing_total_cost_after_shipping`
  - use once shipping and import-tax truth exist but total cost is still unresolved
- `near_valid_waiting_on_one_blocker`
  - use only when a candidate is otherwise strict-safe and down to one blocker

## Current dominant queues
- `shipping_rich_seller_pattern_not_found`
- `seller_pattern_shipping_poor_for_cl`
- `missing_shipping_cost_true_supplier_side`
