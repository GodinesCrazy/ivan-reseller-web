# P17 Supplier Pattern Forensics For Shipping

## Goal
Determine whether usable Chile shipping-cost truth exists only for certain supplier or product patterns.

## Sampled families
- `desk_organization`
- `home_storage`
- `kitchen_storage`

Representative queries:
- `cable organizer`
- `adhesive hook`
- `drawer organizer`
- `desk organizer`
- `kitchen organizer`
- `storage basket`
- `closet organizer`
- `under shelf storage`

## Category summary from live forensics
- `desk_organization`
  - `samples = 2`
  - `withLogisticsInfoDto = 2`
  - `withNormalizedShippingMethods = 0`
- `home_storage`
  - `samples = 4`
  - `withLogisticsInfoDto = 4`
  - `withNormalizedShippingMethods = 0`
- `kitchen_storage`
  - `samples = 2`
  - `withLogisticsInfoDto = 2`
  - `withNormalizedShippingMethods = 0`

## P17 verdict
The current admitted set is uniformly poor for Chile shipping-cost truth.

No better shipping-rich sub-pattern emerged inside the sampled family:
- destination acknowledgement exists
- SKU buyability exists
- shipping-method/cost lines do not appear

## Implication for the next lead seed profile
The next seed profile should not be chosen only for:
- low breakage
- low returns
- low variant complexity

It also needs a new supplier-side filter:
- demonstrated shipping-method or shipping-cost richness for `CL`

Without that, the strict ML Chile funnel will keep filling with CL-acknowledged but commercially incomplete candidates.
