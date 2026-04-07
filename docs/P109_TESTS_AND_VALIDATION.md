# P109 — Tests and validation

## Type-check

```text
cd backend
npm run type-check
```

Status: **pass** (includes fix for `Uint8Array` narrowing in `ml-portada-isolation.service.ts`).

## Focused Jest suites

```text
cd backend
npx jest --testPathPattern="ml-portada-isolation|ml-portada-studio-prep-p109|ml-image-readiness|ml-portada-hero-reconstruction"
```

Covers:

- P109 segmentation variants produce valid PNGs (`ml-portada-isolation.service.test.ts`)
- Studio prep none vs halo (`ml-portada-studio-prep-p109.service.test.ts`)
- Readiness mapping for `AUTONOMOUS_V2_RECOVERY_EXHAUSTED` + P109 fields (`ml-image-readiness.service.test.ts`)
- Existing hero reconstruction behavior (`ml-portada-hero-reconstruction.service.test.ts`)

## Benchmark

```text
cd backend
npx tsx scripts/p109-automatic-portada-benchmark-32714.ts
```

Output: **`p109-benchmark-32714.json`** at repo root.

## Regression boundaries

- Pricing and Mercado Libre credentials: **unchanged** in P109 scope.
- Gate philosophy: **unchanged** (strict pass required).
