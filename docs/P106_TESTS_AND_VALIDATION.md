# P106 — Tests and validation

## Commands run

```text
cd backend
npm run type-check
```

```text
npx jest src/services/__tests__/p105-supplement-hero-precedence.test.ts src/services/__tests__/ml-portada-hero-reconstruction.service.test.ts --no-cache
```

## P106 script smoke

```text
npx tsx scripts/p106-real-supplement-hero-live-32714.ts
```

**Expected:** exit code **1**, **`p106-live-result.json`** with **`fatalError: p106_real_supplement_hero_missing`**.

## Not run (blocked)

- Full P106 path with real URL/workspace file (no operator-supplied asset in this session).
- Seller Center manual verification.
