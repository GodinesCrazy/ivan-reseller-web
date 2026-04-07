# P32 FX Fee Model Completion

Date: 2026-03-22

## Goal

Complete the FX fee estimate required for supplier `USD` costs and MercadoLibre Chile listing `CLP` revenue.

## Audit result

Before P32, the cross-currency fee path could fail with:

- `missing_fxFeeEstimate`
- internal reason: `fx_fee_model_not_implemented`

That blocked controlled publication even after freight and auth were already solved.

## Completion implemented

The fee ledger now uses an explicit conservative cross-currency buffer model in `backend/src/services/listing-fee-ledger.service.ts`.

Model behavior:

- if supplier and listing currencies are the same: `same_currency_no_fx_fee`
- if cross-currency is required: apply `FX_FEE_BUFFER_PCT`
- default fallback buffer if env is absent: `3%`

The model exposes and persists:

- `fxFeeEstimate`
- `fxModel`
- `fxInputs`
- `currencySafety`

## Runtime proof on candidate 32690

Persisted preventive snapshot after the P32 rerun:

- `fxFeeEstimate.amount = 115.32`
- `fxFeeEstimate.currency = CLP`
- `fxFeeEstimate.state = estimated`
- `fxFeeEstimate.source = default_cross_currency_buffer_pct`
- `fxModel = default_cross_currency_buffer_pct`

Persisted FX inputs:

- `supplierCurrency = USD`
- `listingCurrency = CLP`
- `fxRequired = true`
- `bufferPct = 3`
- `feeBaseAmount = 3844`
- `usedConfiguredBufferPct = false`

Persisted currency safety:

- `sourceCurrency = USD`
- `listingCurrency = CLP`
- `fxRequired = true`
- `state = buffered`
- `bufferPct = 3`

## Verification

Command executed:

```text
backend npx jest src/__tests__/services/listing-fee-ledger.service.test.ts --runInBand
```

Result:

- test suite passed `4/4`, including default and configured ML Chile fee / FX model coverage

