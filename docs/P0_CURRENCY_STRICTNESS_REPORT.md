# P0 Currency Strictness Report

Date: 2026-03-20

## Objective

Eliminate silent generic currency fallbacks from live publish paths.

## Problem fixed

The previous destination logic could still default non-US eBay contexts to `USD`.  
That is unacceptable for safe publication and real profitability.

## Hardening implemented

Strict destination resolution was added for live marketplace contexts.

### Explicit mappings now enforced

- eBay US -> `US / USD`
- eBay GB -> `GB / GBP`
- eBay DE -> `DE / EUR`
- eBay ES -> `ES / EUR`
- eBay FR -> `FR / EUR`
- eBay IT -> `IT / EUR`
- MercadoLibre Chile -> `CL / CLP`

### Fail-closed behavior

If marketplace country/currency cannot be resolved safely:
- destination context is marked unresolved
- preventive publish validation blocks publication
- live publish path cannot proceed on implicit USD fallback

## Backend changes

- `backend/src/services/destination.service.ts`
- `backend/src/services/marketplace-context.service.ts`
- `backend/src/services/pre-publish-validator.service.ts`
- `backend/src/services/marketplace.service.ts`
- `backend/src/services/real-profit-engine.service.ts`

## Regression tests

Passed:
- eBay ES resolves to `ES / EUR`
- eBay GB resolves to `GB / GBP`
- unknown eBay marketplace fails closed
- MercadoLibre Chile resolves to `CL / CLP`

## Finance safety extension

`GET /api/finance/real-profit` now includes:
- `profitClassification`
- `feeCompleteness`
- `currencySafety`

Local authenticated validation returned:

```json
{
  "currencySafety": {
    "safeOrders": 0,
    "unresolvedOrders": 0,
    "state": "safe"
  }
}
```

Interpretation:
- the endpoint now exposes currency-safety truth explicitly
- in the current production dataset there are no completed real sales in the evaluated window, so the state is safe by emptiness, not by broad cross-border proof

## Remaining currency blockers

- broader international profit modeling is still incomplete
- FX is still not a first-class audited ledger across all publication scenarios
- policy/language completeness still needs P1/P2 work
