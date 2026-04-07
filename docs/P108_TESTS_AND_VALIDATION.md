# P108 — Tests and validation

## Commands

```text
cd backend
npm run type-check
```

```text
npx jest src/services/__tests__/ml-portada-advanced-recovery.service.test.ts src/services/__tests__/ml-image-readiness.service.test.ts src/services/__tests__/ml-portada-hero-reconstruction.service.test.ts --no-cache
```

## Suites

| File | Coverage |
|------|-----------|
| `ml-portada-advanced-recovery.service.test.ts` | Profile order, `p108_none` identity, each non-none profile produces valid PNG. |
| `ml-image-readiness.service.test.ts` | P108 classification + `portadaAutomationRecipeFamily` when recovery waves listed. |
| `ml-portada-hero-reconstruction.service.test.ts` | Existing isolation / P105 suppression (regression). |

## Benchmark

```text
npx tsx scripts/p108-automatic-portada-benchmark-32714.ts
```

Produces **`p108-benchmark-32714.json`** (~100s+ depending on network and CPU).
