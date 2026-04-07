# P79 — Tests and validation

## Type-check

```bash
cd backend && npm run type-check
```

## Unit tests

```bash
npx jest src/services/marketplace-image-pipeline/__tests__/hero-cover-quality-gate.service.test.ts --no-cache
npx jest src/services/__tests__/mercadolibre-image-remediation.service.test.ts --no-cache
```

**Hero suite covers:**

- Large centered subject → **pass**  
- **Postage-stamp** small subject on 1536² canvas → **fail**  
- **Thin-strip** composition → **fail**

## Real SKU

`npx tsx scripts/check-ml-image-remediation.ts 32690` — see `P79_REAL_SKU_REVALIDATION.md`.
