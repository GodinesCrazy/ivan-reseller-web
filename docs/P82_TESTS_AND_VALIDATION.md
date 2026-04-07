# P82 — Tests and validation

## Type-check

```bash
cd backend
npm run type-check
```

Result: `tsc --noEmit` passed (2026-03-25).

## Focused Jest — simulation ranking

File: `backend/src/services/marketplace-image-pipeline/__tests__/remediation-simulation.service.test.ts`

```bash
cd backend
npx jest src/services/marketplace-image-pipeline/__tests__/remediation-simulation.service.test.ts --no-cache
```

Coverage:

- **Stronger simulated portada wins** even when P81 `remediationFitness` would favor a weaker candidate (higher heuristic on the weak image).
- **Trace-level semantics:** `simAllCorePass` / `allWeak` when preview fails hero.

Result: **2/2** passed (2026-03-25).

## Real SKU

See `docs/P82_REAL_SKU_REVALIDATION.md` (`p82_32690_check.json`, `p82_32690_forced.json`).
