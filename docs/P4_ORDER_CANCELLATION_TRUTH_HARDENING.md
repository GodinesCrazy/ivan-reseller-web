# P4 Order Cancellation Truth Hardening

## What Was Implemented
- Added `order-truth.service.ts` to produce explicit operational truth flags:
  - `manuallyCancelledMarketplaceSide`
  - `excludedFromCommercialProof`
  - `commercialProofEligible`
  - `truthNeedsOperatorConfirmation`
  - `operatorTruthReason`
  - `marketplaceObservedStatus`
- Added a real correction script:
  - `backend/scripts/mark-order-marketplace-cancelled.ts`
- Added route support:
  - `POST /api/orders/by-ebay-id/:ebayOrderId/mark-marketplace-cancelled`
- Orders API responses now include `truthFlags`.
- `SaleService.createSaleFromOrder(...)` now refuses to create a sale from an order excluded from commercial proof.

## Real Correction Applied
Command:
- `npx tsx scripts/mark-order-marketplace-cancelled.ts 17-14370-63716 "...excluded from commercial proof."`

Verified result:
- `status = FAILED`
- `failureReason = MANUALLY_CANCELLED_MARKETPLACE_SIDE`
- `errorMessage = Order manually cancelled on eBay because it was not profitable and must be excluded from commercial proof.`
- `truthFlags.manuallyCancelledMarketplaceSide = true`
- `truthFlags.excludedFromCommercialProof = true`
- `truthFlags.commercialProofEligible = false`

## Important Truth
- The order still exists as a real marketplace event.
- It is no longer eligible to be used as commercial-success evidence.
- This separates operational existence from business proof, which was the missing distinction.
