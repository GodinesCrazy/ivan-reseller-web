# P1 Fee Ledger Completeness Report

## Implemented

- Added `listing-fee-ledger.service.ts`.
- Every safe publish preparation now computes:
  - `supplierCost`
  - `shippingCost`
  - `marketplaceFeeEstimate`
  - `paymentFeeEstimate`
  - `fxFeeEstimate`
  - `listingFeeEstimate`
  - `revenueEstimate`
  - `totalKnownCost`
  - `projectedProfit`
  - `projectedMargin`
  - `feeCompleteness`
  - `blockedByFinancialIncompleteness`

## Current strictness

- Missing marketplace fee config blocks `eBay US` and `MercadoLibre CL`.
- Cross-currency publication blocks when FX fee is not modeled.
- No product can pass preventive publish if fee ledger reports missing mandatory classes.

## Important consequence

- `MercadoLibre Chile` remains financially blocked today because FX fee modeling is still absent.
- `eBay US` can only become financially complete if explicit fee config exists in runtime env.

## Regression proof

- `listing-fee-ledger.service.test.ts` passed.
