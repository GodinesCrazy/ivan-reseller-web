# P14 Strict ML Chile Funnel Re-Entry

## Objective

Measure whether the new Chile-supported seed strategy produces candidates that can re-enter the strict ML Chile funnel and improve readiness.

## Re-Entry Result

No candidate reached strict funnel re-entry because:

- `admittedAfterChileSupportGate = 0`
- `admittedAfterClSkuGate = 0`

So P14 produced:

- no new `targetCountry = CL` persistence from admitted seeds
- no new `aliexpressSku` persistence from admitted seeds
- no new shipping/import-tax/total-cost persistence from admitted seeds
- no new strict `VALIDATED_READY` candidate

## Broad Readiness Recheck

Live command:

- `npm run check:ml-chile-controlled-operation -- 1`

Coverage remains:

- `targetCountryCl = 0`
- `missingShippingCost = 1000`
- `missingImportTax = 1000`
- `missingTotalCost = 1000`
- `missingAliExpressSku = 999`
- `strictMlChileReadyCount = 0`
- `mlSalesSummary.total = 0`
- `mlOrdersSummary.total = 0`

## Classification

- `targetCountryCl`: unchanged, blocked by supplier truth
- `missingAliExpressSku`: unchanged, blocked by supplier truth
- `missingShippingCost`: unchanged, blocked by supplier truth
- `missingImportTax`: unchanged, blocked by upstream shipping/cost incompleteness
- `missingTotalCost`: unchanged, blocked by upstream shipping/tax incompleteness
- `strictMlChileReadyCount`: unchanged, blocked by supplier truth before funnel entry

## Important Note

The dedicated auth runtime check still proves ML Chile auth is usable, while the broad readiness script still reports the older auth-missing state. That inconsistency remains diagnostic debt, but it is no longer the lead business blocker.

## P14 Verdict

`STRICT ML CHILE FUNNEL RE-ENTRY = PARTIAL`
