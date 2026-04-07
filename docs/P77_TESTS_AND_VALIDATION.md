# P77 — Tests and validation

## Type-check

```bash
cd backend && npm run type-check
```

**Result:** Pass (2026-03-25).

## Focused Jest tests

```bash
cd backend && npx jest src/services/__tests__/mercadolibre-image-remediation.service.test.ts --no-cache
```

**Coverage:**

- P77 **reject_hard + stale pack** → `publishSafe` false + blocker + `integrationLayerOutcome: reject_hard`
- P77 **override** via `allowStalePackWhenRejectHard` → `publishSafe` true + `reject_hard_stale_pack_override_publish`
- P76 **human_review** still fail-closed vs disk pack
- P76 **raw_ordered** mock path + updated `handledKind` / `mlChileCanonicalPipeline` shape

**Result:** 7 tests passed.

## Real SKU script

```bash
npx tsx scripts/check-ml-image-remediation.ts 32690
```

Requires **`DATABASE_URL`**. Emits **`p77Summary`** and full **`mlChileCanonicalPipeline.trace`**.

**Result:** See `P77_END_TO_END_REAL_SKU_VALIDATION.md`.
