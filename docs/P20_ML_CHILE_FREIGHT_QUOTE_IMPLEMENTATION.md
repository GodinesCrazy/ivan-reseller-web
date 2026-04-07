# P20 ML Chile Freight Quote Implementation

## Scope
P20 replaced the old ML Chile shipping-cost assumption with a real supplier-side freight path based on `aliexpress.logistics.buyer.freight.calculate`.

## Implemented
- Added AliExpress freight normalization in [backend/src/utils/aliexpress-freight-normalizer.ts](/c:/Ivan_Reseller_Web/backend/src/utils/aliexpress-freight-normalizer.ts).
- Added deterministic ML Chile freight selection in [backend/src/utils/ml-chile-freight-selector.ts](/c:/Ivan_Reseller_Web/backend/src/utils/ml-chile-freight-selector.ts).
- Added landed-cost calculation for Chile VAT 19% in [backend/src/utils/ml-chile-landed-cost.ts](/c:/Ivan_Reseller_Web/backend/src/utils/ml-chile-landed-cost.ts).
- Added buyer-freight client support in [backend/src/services/aliexpress-dropshipping-api.service.ts](/c:/Ivan_Reseller_Web/backend/src/services/aliexpress-dropshipping-api.service.ts).
- Updated [backend/src/services/pre-publish-validator.service.ts](/c:/Ivan_Reseller_Web/backend/src/services/pre-publish-validator.service.ts) so ML Chile no longer expects shipping truth only from `getProductInfo().shippingInfo`.

## Endpoint Reality Used
- Product/SKU truth path: `aliexpress.ds.product.get` and related DS product methods.
- Freight truth path: `aliexpress.logistics.buyer.freight.calculate`.
- Current implementation now treats freight quote as the intended source of supplier shipping cost truth for ML Chile.

## Fresh Runtime Result
- The freight client now reaches the freight endpoint and gets a real API response.
- Current live blocker is not `missing_shipping_cost` semantics anymore.
- Current live blocker is credential/app compatibility at the freight endpoint:
  - `dropshipping` credential has session tokens but freight call returns `Code: 29`, `sub_code: isv.appkey-not-exists`, `msg: Invalid app Key`.
  - `affiliate` credential exists with a valid-looking app key prefix, but has no access token / refresh token, so it cannot satisfy the freight endpoint session requirement.

## P20 Verdict
- Freight quote integration is implemented in code.
- Live freight quote retrieval for ML Chile is still blocked before any quote can be persisted.
- The blocker moved from “wrong shipping source” to “AliExpress freight endpoint credential/app mismatch”.
