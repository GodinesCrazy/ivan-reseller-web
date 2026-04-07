# P12 ML Chile Commercial Truth Recheck

## Objective
Measure whether the P12 auth and CL-SKU changes materially improved ML Chile strict readiness.

## Fresh readiness evidence
Command used:

```powershell
npm run check:ml-chile-controlled-operation -- 1
```

Observed coverage:

```json
{
  "coverage": {
    "totalScanned": 1000,
    "targetCountryCl": 0,
    "wrongOrMissingTargetCountry": 1000,
    "missingShippingCost": 1000,
    "missingImportTax": 1000,
    "missingTotalCost": 1000,
    "missingAliExpressSku": 999,
    "strictMlChileReadyCount": 0
  }
}
```

## Field-by-field recheck
- `targetCountry = CL`: unchanged
- `shippingCost`: unchanged
- `importTax`: unchanged
- `totalCost`: unchanged
- stable AliExpress SKU: unchanged at broad readiness scale
- `strictMlChileReadyCount`: unchanged at `0`

## Correct classification
- `targetCountry = CL`: still blocked
- `shippingCost`: still blocked
- `importTax`: still blocked
- `totalCost`: still blocked
- stable AliExpress SKU: still blocked
- strict ML Chile readiness: still blocked

## Root-cause interpretation
P12 improved upstream filtering, not broad catalog truth coverage.

The fresh evidence shows:
- marketplace auth is still blocked
- the clean supplier gate now proves the current candidate pool is not Chile-shippable enough to even enter enrichment
- because nothing is admitted, broad readiness fields do not improve materially at persistence scale

## P12 verdict
- Status: `DONE`
- Material broad readiness improvement: `NO`
- Blocked mainly by: supplier truth quality and missing ML tokens
