# P17 AliExpress CL Shipping Forensics

## Objective
Determine whether AliExpress Dropshipping is actually returning Chile shipping method and shipping-cost truth for the currently admitted ML Chile candidates, or only acknowledging `CL` without usable shipping lines.

## Fresh runtime evidence
- Command: `npm run forensic:ml-chile-logistics -- 1`
- Date: March 21, 2026
- Sample size: `8` Chile-admitted and CL-SKU-admitted candidates

## Core result
For all `8/8` sampled candidates:
- `hasClassicShippingInfo = false`
- `hasLogisticsInfoDto = true`
- `normalizedShippingMethodCount = 0`
- `logisticsInfoKeys = ["delivery_time", "ship_to_country"]`
- `logisticsInfoDtoPreview.delivery_time = 7`
- `logisticsInfoDtoPreview.ship_to_country = "CL"`

## Interpretation
AliExpress Dropshipping is acknowledging Chile at destination level for the sampled products, but it is not returning real shipping method or shipping-cost lines in the normalized supplier truth currently available to the platform.

There is no live evidence in the sampled set of:
- method identifiers
- freight arrays
- shipping price rows
- free-shipping markers
- normalized carrier/service lines

## Representative admitted candidate
- product `1005010571002222`
- query `cable organizer`
- admitted after Chile-support gate
- admitted after CL-SKU gate
- still blocked by `missing_shipping_cost`

## P17 verdict
For the current admitted Chile-first sample family, the supplier layer is acknowledging `CL` but not returning real shipping method/cost truth.
