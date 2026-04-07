# P32 MLC Marketplace Fee Completion

Date: 2026-03-22

## Goal

Complete the MercadoLibre Chile marketplace fee estimate required for the controlled publish of candidate `32690`.

## Audit result

Before P32, the ML Chile fee ledger could fail with:

- `missing_marketplaceFeeEstimate`

The blocking reason came from the fee ledger path expecting an explicit `ML_COMMISSION_PCT` configuration for MercadoLibre CL and not always producing a publish-safe estimate.

## Completion implemented

The ML Chile marketplace fee path now uses an explicit auditable model in `backend/src/services/listing-fee-ledger.service.ts`:

- default commission fallback: `12%`
- low tier max: `9990 CLP`
- mid tier max: `19990 CLP`
- low tier fixed fee: `700 CLP`
- mid tier fixed fee: `1000 CLP`

If env values are present, the same path uses them. If env values are absent, it falls back to the explicit default ML Chile model instead of leaving the estimate unresolved.

The fee ledger now exposes and persists:

- `marketplaceFeeEstimate`
- `marketplaceFeeModel`
- `marketplaceFeeInputs`

## Runtime proof on candidate 32690

Persisted preventive snapshot after the P32 rerun:

- `marketplaceFeeEstimate.amount = 2850`
- `marketplaceFeeEstimate.currency = CLP`
- `marketplaceFeeEstimate.state = estimated`
- `marketplaceFeeEstimate.source = default_mercadolibre_cl_fee_schedule`
- `marketplaceFeeModel = default_mercadolibre_cl_commission_with_fixed_tiers`

Persisted model inputs:

- `revenueEstimate = 23750`
- `commissionPct = 12`
- `fixedFeeApplied = 0`
- `lowTierMax = 9990`
- `midTierMax = 19990`
- `lowTierFixed = 700`
- `midTierFixed = 1000`
- `usedConfiguredCommissionPct = false`

## Verification

Commands executed:

```text
backend npm run type-check
backend npx jest src/__tests__/services/listing-fee-ledger.service.test.ts --runInBand
```

Results:

- `tsc --noEmit` passed
- fee-ledger test suite passed `4/4`

