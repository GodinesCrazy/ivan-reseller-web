# P102 — Tests and validation

## Type check

```bash
cd backend && npm run type-check
```

Result: **PASS** (`tsc --noEmit` exit 0).

## Focused tests

```bash
cd backend && npx jest src/services/__tests__/ml-portada-visual-compliance.service.test.ts --no-cache
cd backend && npx jest src/services/__tests__/mercadolibre-image-remediation.service.test.ts --no-cache
```

Results:

- `ml-portada-visual-compliance.service.test.ts`: **10/10 passed** (includes new white-background failure cases)
- `mercadolibre-image-remediation.service.test.ts`: **7/7 passed**

## Runtime validation artifacts

- `p101-republish-result.json` (updated for P102 republish)
- `artifacts/ml-image-packs/product-32714/ml-asset-pack.json` (listing id + p102 asset source)
- `p102-live-update-result.json` (records failed bounded supplier-search attempt; direct live update lock evidence captured in runtime error logs)
