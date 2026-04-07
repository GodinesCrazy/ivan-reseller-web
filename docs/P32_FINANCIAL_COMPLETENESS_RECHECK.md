# P32 Financial Completeness Recheck

Date: 2026-03-22

## Candidate

`32690`

## Recheck inputs

Fresh persisted runtime state after fee-ledger completion:

- `targetCountry = CL`
- `shippingCost = 2.99`
- `importTax = 0.80`
- `finalPrice = 25.00 USD`
- `listingCurrency = CLP`
- `finalPriceSentToMarketplace = 23750 CLP`

Preventive publish snapshot:

- `marketplaceFeeEstimate.amount = 2850 CLP`
- `fxFeeEstimate.amount = 115.32 CLP`
- `feeLedger.completenessState = complete`
- `feeLedger.feeCompleteness = 1`
- `feeLedger.missingFeeClasses = []`
- `feeLedger.blockedByFinancialIncompleteness = false`

## Classification

`financially_complete_ready_for_publish`

## Publish safety conclusion

After P32, candidate `32690` was no longer blocked by:

- `missing_marketplaceFeeEstimate`
- `missing_fxFeeEstimate`

The financial completeness gate passed and the controlled publish path was able to proceed to real MercadoLibre listing creation.

## Supporting command output

```text
backend npm run check:ml-chile-controlled-operation -- 1
```

Key result:

- `runtimeUsable = true`
- `oauthReauthRequired = false`
- `coverage.strictMlChileReadyCount = 16`

