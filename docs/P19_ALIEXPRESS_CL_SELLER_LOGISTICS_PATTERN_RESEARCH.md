# P19 AliExpress CL Seller / Logistics Pattern Research

## Objective
Determine whether specific seller, store, logistics, or ship-from patterns inside AliExpress correlate with richer Chile shipping truth and can unlock the ML Chile strict funnel.

## Fresh evidence base
- `npm run run:ml-chile-discovery-seed-pass -- 1 8`
- live `getProductInfo` runtime logs during that pass

## What the live payloads consistently exposed
Across the tested broader families, raw Dropshipping responses repeatedly exposed:
- `ae_store_info`
- `package_info_dto`
- `logistics_info_dto`

But the runtime logs also repeatedly exposed the same logistics limitation:
- `logisticsInfoKeys = ["delivery_time", "ship_to_country"]`
- `normalizedShippingMethodCount = 0`

This pattern held across product IDs such as:
- `1005011570887780`
- `1005007817537666`
- `1005010648079934`
- `1005007930068985`
- `1005010784427692`

## Seller / logistics pattern verdict
### Chile-shipping-poor
Seller/logistics patterns where:
- store info exists
- package info exists
- `logistics_info_dto` exists
- Chile is acknowledged
- but no shipping methods or shipping costs are normalized

This is the dominant observed pattern.

### Chile-shipping-rich
Not found in the tested live set.

### Ambiguous / data-incomplete
Not dominant in the tested live set. The main issue is not missing seller records; it is missing shipping richness despite seller/package presence.

## P19 conclusion
The current AliExpress lead-path candidates are not failing because seller/store identity is missing.
They are failing because the observed seller/logistics patterns are still shipping-poor for Chile even when seller and package structures are present.
