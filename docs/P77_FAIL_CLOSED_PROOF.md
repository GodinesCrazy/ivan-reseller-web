# P77 — Fail-closed proof

## 1) `human_review_required` + approved disk pack (real SKU 32690)

**Before P76:** Risk that policy-only or legacy paths could treat an old pack as publishable while canonical logic wanted review.

**After P76/P77:** With canonical **`human_review_required`**:

- **`mayUseApprovedDiskPack`** requires `canonicalHandled.kind !== 'human_review'` → **false**
- **`publishSafe`** stays **false**
- **E2E run:** `packApproved: true`, `publishSafe: false`, `integrationLayerOutcome: human_review_required` (see `P77_END_TO_END_REAL_SKU_VALIDATION.md`)

## 2) `reject_hard` + approved disk pack (unit test)

**Before P77:** `reject_hard` + `images: '[]'` + `createApprovedPack` → **`publishSafe: true`** (stale pack).

**After P77:** Same scenario → **`publishSafe: false`**, blocker **`reject_hard_stale_pack_not_permitted_without_override_p77`**, **`integrationLayerOutcome: reject_hard`**.

**Test:** `backend/src/services/__tests__/mercadolibre-image-remediation.service.test.ts` — `P77: reject_hard does not stay publish-safe from a stale disk pack without explicit override`.

## 3) Explicit override path (audited, not silent)

With `productData.mlImagePipeline.allowStalePackWhenRejectHard: true`:

- **`publishSafe: true`**
- **`integrationLayerOutcome: reject_hard_stale_pack_override_publish`**
- **Server log:** `[ML-IMAGE-REMEDIATION] P77 reject_hard stale pack override active — explicit operator intent`

This is the **only** intended way to reuse a disk pack under `reject_hard`.
