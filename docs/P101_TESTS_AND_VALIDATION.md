# P101 — Tests and validation

Run after P101 code path and pack changes:

## TypeScript

```bash
cd backend && npm run type-check
```

**Result (P101):** `tsc --noEmit` exited **0**.

## Focused Jest suites (sprint-relevant)

```bash
cd backend && npx jest src/services/__tests__/ml-portada-visual-compliance.service.test.ts --no-cache
cd backend && npx jest src/services/__tests__/mercadolibre-image-remediation.service.test.ts --no-cache
```

**Result (P101):** both suites **passed** (8 + 7 tests).

## Operational proof artifact

- Root: `p101-republish-result.json` — full runtime snapshot (preflight, payload order, publish result, item verification, persistence).
