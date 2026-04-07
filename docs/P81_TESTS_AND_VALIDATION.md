# P81 — Tests and validation

## Type-check

```bash
cd backend
npm run type-check
```

Result: `tsc --noEmit` passed (2026-03-25).

## Focused Jest tests (remediation fitness ranking)

File:

- `backend/src/services/marketplace-image-pipeline/__tests__/remediation-fitness-selection.service.test.ts`

Command:

```bash
cd backend
npx jest src/services/marketplace-image-pipeline/__tests__/remediation-fitness-selection.service.test.ts --no-cache
```

Result:

- 2/2 tests passed:
  - prefers a clear centered subject (higher remediationFitness)
  - penalizes near-blank white fields (lower remediationFitness)

