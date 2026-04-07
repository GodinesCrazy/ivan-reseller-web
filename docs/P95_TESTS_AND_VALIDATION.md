# P95 — Tests and Validation

## Backend Type Check

```
> ivan-reseller-backend@1.0.0 type-check
> tsc --noEmit
Exit code: 0
```

✅ PASSED — no TypeScript errors.

## Evidence Summary

### Executed (with DB mutations)

| Script | Purpose | Result |
|---|---|---|
| `p95-run-now.ts` | Freight fetch, persistence, preparation | ✅ Freight persisted, preparation failed (economics) |
| `p95-check-state.ts` | Read-only state verification | ✅ Confirmed freight truth + VALIDATED_READY |
| `p95-preflight-check.ts` | Economics core + full preflight | ✅ Economics block confirmed, preflight captured |

### Inspected (read-only)

| File | Purpose |
|---|---|
| `pre-publish-validator.service.ts` | Understood freight truth resolution, economics core, preparation flow |
| `mercadolibre-publish-preflight.service.ts` | Understood preflight aggregator, status check precedence |
| `p95-recover-ml-chile-freight-32714.ts` | Reviewed existing recovery script |
| P94 docs | Verified prior blocked state |

### Database State After P95

| Column | Value |
|---|---|
| `status` | VALIDATED_READY |
| `isPublished` | false |
| `shippingCost` | 3.12 |
| `importTax` | 1.20 |
| `totalCost` | 7.51 |
| `targetCountry` | CL |
| `originCountry` | CN |
| `currency` | USD |
| `updatedAt` | 2026-03-26T20:25:02.570Z |

### Metadata After P95

| Key | Present | Valid |
|---|---|---|
| `mlChileFreight` | ✅ | ✅ `freight_truth_ready_for_publish` |
| `mlChileLandedCost` | ✅ | ✅ `complete` |
| `preventivePublish` | ❌ | N/A (economics blocked) |
| `p92StagingCandidate` | ✅ | informational |

### Canonical Freight Truth After P95

```json
{
  "status": "freight_truth_ready_for_publish",
  "ok": true,
  "truth": {
    "selectedServiceName": "CAINIAO_STANDARD",
    "selectedFreightAmount": 3.12,
    "selectedFreightCurrency": "USD",
    "shippingUsd": 3.12,
    "ageHours": 0.13
  }
}
```
