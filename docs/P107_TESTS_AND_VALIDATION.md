# P107 — Tests and validation

## Commands

```text
cd backend
npm run type-check
```

```text
npx jest src/services/__tests__/ml-portada-recipes.service.test.ts src/services/__tests__/ml-image-readiness.service.test.ts src/services/__tests__/ml-portada-hero-reconstruction.service.test.ts --no-cache
```

## Coverage

| Suite | Focus |
|-------|--------|
| `ml-portada-recipes.service.test.ts` | Six recipes, 1200×1200 output, legacy id. |
| `ml-image-readiness.service.test.ts` | Strip supplement fields; readiness DTO from P103 result. |
| `ml-portada-hero-reconstruction.service.test.ts` | Isolation+compose smoke; P105 supplier suppression (unchanged). |

## Live benchmark

- **`p107-automatic-portada-benchmark-32714.ts`** → **`p107-benchmark-32714.json`**
