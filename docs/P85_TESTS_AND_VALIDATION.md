# P85 — Tests and validation

## Type-check

```bash
cd backend
npm run type-check
```

Result: **pass**.

## Focused Jest

```bash
cd backend
npx jest src/services/marketplace-image-pipeline/__tests__/commercial-finalist-floor.service.test.ts --no-cache
```

| Case | Expectation |
|------|-------------|
| P84-like strong winner | `pass`, no failure reasons |
| Weak “best finalist” (metrics from real runner-up class) | `pass: false`, readability / center / preference failures |
| High washout + dead space + low subject | Multiple floor failures |

Result: **3/3** passed.

## Regression

- `final-cover-preference.service.test.ts` — pass  
- `mercadolibre-image-remediation.service.test.ts` — pass (trace shape)
