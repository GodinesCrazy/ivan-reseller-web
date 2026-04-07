# P83 — Tests and validation

## Type-check

```bash
cd backend
npm run type-check
```

Result: **pass** (`tsc --noEmit`, 2026-03-25).

## Jest

```bash
cd backend
npx jest src/services/marketplace-image-pipeline/__tests__/remediation-simulation.service.test.ts src/services/marketplace-image-pipeline/__tests__/simulation-quality-metrics.service.test.ts --no-cache
```

| Suite | Cases |
|-------|--------|
| `remediation-simulation.service.test.ts` | Strong vs weak hero still orders correctly; tiny-subject `allWeak`; **hi-fi rows** when enabled |
| `simulation-quality-metrics.service.test.ts` | **Washy suspicious-pass** scores below healthy same-gate profile |

Result: **4/4** passed (2026-03-25).

## Real SKU

See `docs/P83_REAL_SKU_REVALIDATION.md` (`p83_32690_forced.json`).
