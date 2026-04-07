# P80 — Tests and validation

## Type-check

```bash
cd backend
npm run type-check
```

**Result:** `tsc --noEmit` — **pass** (2026-03-25).

## Focused Jest suite

File: `backend/src/services/marketplace-image-pipeline/__tests__/output-integrity-gate.service.test.ts`

| Case | Expectation |
|------|-------------|
| Fully blank white JPEG | **Fail** (signal / near-white / stdev / range) |
| Near-uniform `#fefefe` field | **Fail** |
| Two-band near-white composite (weak global contrast) | **Fail** (range / signal / near-white) |
| Strong dark subject on white (catalog-style) | **Pass** |
| Full-canvas hero metrics + nearly blank pixels | **Fail** (trim suspicion and/or signal) |

Command:

```bash
cd backend
npx jest src/services/marketplace-image-pipeline/__tests__/output-integrity-gate.service.test.ts --no-cache
```

**Result:** **5 passed** (2026-03-25).

## Real SKU script

`npx tsx scripts/check-ml-image-remediation.ts 32690` — see `P80_REAL_SKU_REVALIDATION.md`.
