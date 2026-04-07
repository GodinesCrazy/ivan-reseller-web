# PHASE 8C - Multi-Region Validation Report

Date: 2026-03-20
Mode: real-data only
Status: marketplace-aware validation implemented and verified

## Objective

Validate products per combination:

- `product`
- `marketplace`
- `country`

Rule enforced:

- a product valid for `MercadoLibre Chile` is not assumed valid for `eBay USA`
- destination country must come from marketplace context, not server or user defaults

## System Changes Implemented

Implemented in code:

- explicit marketplace context service with:
  - country
  - currency
  - language
  - destination metadata
  - fee model source
- preventive validator now resolves destination from marketplace context
- multi-region validation service added
- real search runner added for:
  - `MercadoLibre Chile`
  - `eBay USA`
- rebuild default max price updated to `20 USD`
- language-aware query matching improved for Spanish results in Chile

Main files:

- [backend/src/services/marketplace-context.service.ts](c:/Ivan_Reseller_Web/backend/src/services/marketplace-context.service.ts)
- [backend/src/services/multi-region-validation.service.ts](c:/Ivan_Reseller_Web/backend/src/services/multi-region-validation.service.ts)
- [backend/src/services/pre-publish-validator.service.ts](c:/Ivan_Reseller_Web/backend/src/services/pre-publish-validator.service.ts)
- [backend/scripts/run-multi-region-validation.ts](c:/Ivan_Reseller_Web/backend/scripts/run-multi-region-validation.ts)

## Real Validation Runs

All runs used:

- real AliExpress Affiliate search
- real AliExpress Dropshipping `getProductInfo`
- real marketplace credentials
- strict preventive publish gate
- `maxPriceUsd = 20`
- `minSupplierSearch = 10`

### MercadoLibre Chile

Marketplace context resolved:

- marketplace: `mercadolibre`
- country: `CL`
- currency: `CLP`
- language: `es`
- siteId: `MLC`

Real runs executed:

1. `cell phone holder`
- scanned: `10`
- rejected: `10`
- validated: `0`

2. `cable organizer`
- scanned: `10`
- rejected: `10`
- validated: `0`

Observed real rejection patterns in Chile:

- many candidates failed with:
  - `candidate failed strict supplier/shipping/profit validation across all configured price multipliers`
- repeated low-level preventive failure in logs:
  - `Product not valid for publishing: no AliExpress SKU with stock > 0 for this destination`
- some candidates exceeded `20 USD`
- some search returns were irrelevant due Affiliate search breadth, but they were safely rejected

Examples from Chile:

- `1005010763834083`
  - title: magnetic phone holder
  - sourcePriceUsd: `2.19`
  - result: rejected
  - reason: no valid supplier/SKU path survived preventive validation for `CL`

- `1005010651979849`
  - title: suction wall phone holder
  - sourcePriceUsd: `1.22`
  - result: rejected
  - reason: no AliExpress SKU with stock `> 0` for destination `CL`

- `1005010727936643`
  - title: cable reel
  - sourcePriceUsd: `14.66`
  - result: rejected
  - reason: no AliExpress SKU with stock `> 0` for destination `CL`

### eBay USA

Marketplace context resolved:

- marketplace: `ebay`
- country: `US`
- currency: `USD`
- language: `en`
- marketplaceId: `EBAY_US`

Real runs executed:

1. `cell phone holder`
- scanned: `10`
- rejected: `10`
- validated: `0`

2. `usb light`
- scanned: `10`
- rejected: `10`
- validated: `0`

Observed real rejection patterns in USA:

- same strict preventive rejection appeared with US destination:
  - `Product not valid for publishing: no AliExpress SKU with stock > 0 for this destination`
- some products passed search relevance but still failed supplier availability
- several lighting products exceeded `20 USD`

Examples from USA:

- `3256810231261039`
  - title: MagSafe magnetic ring holder
  - sourcePriceUsd: `1.66`
  - result: rejected
  - reason: no valid supplier/SKU path survived preventive validation for `US`

- `3256810465665097`
  - title: silicone suction phone holder mat
  - sourcePriceUsd: `1.20`
  - result: rejected
  - reason: no AliExpress SKU with stock `> 0` for destination `US`

- `3256810180801292`
  - title: motion sensor LED night light
  - sourcePriceUsd: `3.13`
  - result: rejected
  - reason: no AliExpress SKU with stock `> 0` for destination `US`

## CL vs US Comparison

What was verified:

- the engine now resolves country from marketplace context correctly
- Chile validation used `CL / CLP / es / MLC`
- USA validation used `US / USD / en / EBAY_US`
- the same class of product can be rejected independently per region
- no cross-region validity is assumed anywhere in the new path

What changed in practice:

- `MercadoLibre Chile` returned mostly Spanish titles and validated against `CL`
- `eBay USA` returned English titles and validated against `US`
- the rejection reason remained destination-specific supplier failure, not a generic fallback

Key conclusion:

- the multi-region engine is working correctly
- the supplier side is currently the limiting factor
- no product from the tested sets was valid for both markets

## Database Truth After Runs

Verified directly from the real database after all runs:

- `LEGACY_UNVERIFIED`: `30351`
- `PENDING`: `3`
- `REJECTED`: `2`
- `VALIDATED_READY`: `0`

There is still no first validated product stored.

## Validated Product

First validated product: `none`

Reason:

- no candidate passed all of:
  - destination-country SKU availability
  - real supplier shipping
  - real cost validation
  - positive real profit
  - margin threshold
  - minimum supplier search coverage

## Final Result

Engine status: `WORKING`

Catalog outcome: `NO VALIDATED PRODUCT FOUND YET`

Safety outcome:

- no legacy product reused
- no product published automatically
- no cross-region assumption used
- no validation bypass used

## Next Safe Step

Do not publish yet.

Recommended next move:

- continue real search with the remaining query set:
  - `led light`
  - `phone stand`
  - `kitchen organizer`
- keep the same hard safety gate
- stop only when the first real `VALIDATED_READY` product appears
