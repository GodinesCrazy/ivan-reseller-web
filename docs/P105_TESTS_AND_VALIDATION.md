# P105 — Tests and validation

## Commands run

```text
cd backend
npm run type-check
```

```text
npx jest src/services/__tests__/p105-supplement-hero-precedence.test.ts --no-cache
npx jest src/services/__tests__/ml-portada-hero-reconstruction.service.test.ts --no-cache
```

## What the tests cover

| Area | File |
|------|------|
| Supplement URL / workspace precedence, `mergePortadaPriorityImageUrls`, traversal rejection | `p105-supplement-hero-precedence.test.ts` |
| Isolation + hero compose smoke; **P105 supplier suppression** when supplement configured | `ml-portada-hero-reconstruction.service.test.ts` |

## Live script proof

- **`p105-live-result.json`** at repo root after **`p105-supplement-hero-live-32714.ts`** (documents trace, `failClosedReason`, `supplierTrialsSuppressedForSupplementHero`).

## Not in automated tests

- End-to-end **MercadoLibre** picture replace (requires credentials and compliant PNG).
- **Seller Center** UI verification.
