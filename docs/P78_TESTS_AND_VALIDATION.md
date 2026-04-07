# P78 — Tests and validation

## Type-check

```bash
cd backend && npm run type-check
```

**Result:** Pass.

## Jest

```bash
npx jest src/services/__tests__/mercadolibre-image-remediation.service.test.ts --no-cache
npx jest src/utils/__tests__/candidate-scoring-enumerate.test.ts --no-cache
```

**Result:** All pass (7 + 2 tests).

## Real SKU

```bash
npx tsx scripts/p78-enable-canonical-local-cover-32690.ts
npx tsx scripts/check-ml-image-remediation.ts 32690
```

**Result:** `remediated_pass`, `publishSafe: true`, manifest updated under `artifacts/ml-image-packs/product-32690/`.

## Gate integrity

No changes to **`policy-profiles.ts`** dual-gate minimums or **`dual-gate.service.ts`** rules in P78.
