# P77 — Stale-pack / reject_hard hardening

## Problem (P76)

When `evaluateMercadoLibreImageRemediationDecision` returned **`reject_hard`** (e.g. no source images) but an **older on-disk ML asset pack** was still `packApproved`, the branch `assetPack.packApproved && canonicalHandled.kind !== 'human_review'` set **`publishSafe: true`**. That let **stale artifacts** satisfy publish without matching current audit truth.

## Fix

**File:** `backend/src/services/mercadolibre-image-remediation.service.ts`

- Introduced **`mayUseApprovedDiskPack`**: an approved disk pack is used **only if** `!isRejectHard || rejectHardStalePackOverrideActive`.
- **`isRejectHard`**: `decision.decision === 'reject_hard'` or `remediationPathSelected === 'reject_hard'`.
- When `reject_hard` and a pack exists but override is off: add blocker **`reject_hard_stale_pack_not_permitted_without_override_p77`** and keep **`publishSafe: false`**.

## Explicit operator override (break-glass)

1. **Env:** `ML_IMAGE_STALE_PACK_OVERRIDE_REJECT_HARD=true` or `1`
2. **Per product:** `productData.mlImagePipeline.allowStalePackWhenRejectHard === true` (JSON object or stringified JSON)

When override is active and publish proceeds: **`logger.warn`** with `P77 reject_hard stale pack override active`, and **`metadataPatch.mlChileImageRemediation.integrationLayerOutcome === 'reject_hard_stale_pack_override_publish'`**.

## human_review

Unchanged from P76: **`canonicalHandled.kind === 'human_review'`** still blocks the disk-pack publish branch (`mayUseApprovedDiskPack` requires `canonicalHandled.kind !== 'human_review'`).
