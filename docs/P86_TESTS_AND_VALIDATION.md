# P86 — Tests and validation

## Type-check

```bash
cd backend
npm run type-check
```

## Focused Jest

```bash
cd backend
npx jest src/services/marketplace-image-pipeline/__tests__/commercial-finalist-floor.service.test.ts --no-cache
```

Validates:

- **Good** starter metrics pass `COMMERCIAL_FINALIST_FLOOR_DEFAULTS`.
- **Weak** starter metrics fail with readability, center, preference, **washout**, and silhouette reasons (P86 washout tightening).
- Extreme washout / dead space / low subject still fail.

## Result

Executed in P86 implementation pass: **type-check pass**, **3/3** tests pass.
