# P18 AliExpress CL Shipping-Rich Inventory

## Objective
Discover whether a broader but still controlled AliExpress candidate space contains any Chile-supported, CL-SKU-buyable, shipping-rich pattern that can feed the strict ML Chile funnel.

## Strategy used
The prior low-risk organizer/storage families were replaced with a shipping-rich-first query inventory:
- `sticker pack`
- `washi tape`
- `bookmark magnetic`
- `keychain charm`
- `hair clip`
- `embroidery patch`
- `nail sticker`
- `phone lanyard`

## Fresh runtime evidence
- Command: `npm run run:ml-chile-discovery-seed-pass -- 1 8`
- Date: March 21, 2026

## Discovery totals
- `scannedAtDiscovery = 21`
- `admittedAfterChileSupportGate = 21`
- `admittedAfterClSkuGate = 21`
- `admittedAfterShippingCostGate = 0`
- `validated = 0`

## Shipping-rich inventory verdict
### Shipping-poor for CL
- `washi tape`
- `hair clip`
- `nail sticker`
- `phone lanyard`

All admitted rows in these families still failed with:
- `missing_shipping_cost`

### Ambiguous / not materially represented in final admitted set
- `sticker pack`
- `bookmark magnetic`
- `keychain charm`
- `embroidery patch`

These were part of the seed strategy, but the final admitted live result set did not surface them as winning admitted candidates in this pass.

## Hard conclusion
P18 did not find a shipping-rich pattern for Chile within the tested AliExpress-first family set.

The broader discovery capability is not completely dead:
- Chile support exists
- CL-SKU buyability exists

But the tested pattern families are still shipping-poor for `CL`.
