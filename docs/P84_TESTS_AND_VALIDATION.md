# P84 — Tests and validation

## Type-check

```bash
cd backend
npm run type-check
```

Result: **pass** (`tsc --noEmit`).

## Focused Jest

```bash
cd backend
npx jest src/services/marketplace-image-pipeline/__tests__/final-cover-preference.service.test.ts --no-cache
```

Covers:

- Stronger commercial signals score higher than weaker ones.
- Winner selection and beat-reason strings with two finalists.
- Deterministic tie-break on equal `preferenceScore`.
- Simulation plan dedup + ordering of remediation attempts.

Result: **5/5** passed.

## Regression

`npx jest src/services/__tests__/mercadolibre-image-remediation.service.test.ts --no-cache` — **pass** (empty canonical trace includes P84 fields).

## Live SKU

See `docs/P84_REAL_SKU_REVALIDATION.md` and `p84_32690_forced_raw.txt`.
