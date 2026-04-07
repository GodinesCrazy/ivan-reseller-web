# P85 — Pipeline integration

## Location

`ml-chile-canonical-pipeline.service.ts` — after provisional winner is known, before `writeCanonicalP76Pack` (via return of `pack_buffers`).

## P84 preference path

1. Build finalists and `finalCoverPreferenceWinner`.
2. Set `finalCoverProvisionalWinner` copy when floor is **enabled**.
3. Run `evaluateCommercialFinalistFloor` on the matching `finalCoverPreferenceFinalists[]` row.
4. If fail: `finalOutcome = human_review_required`, `winningRecipeId` / `winningRemediationCandidateUrl` **cleared**, return `human_review_required` with reasons `ml_canonical_commercial_finalist_floor_failed` + `failureReasons`. **No** `pack_buffers` return → remediation service does **not** write a new canonical pack for this run.
5. If pass: step `commercial_finalist_floor_pass:…`, then emit pack as today.

## Legacy path (P84 preference off)

First gate-passing remediation: compute `evaluateFinalCoverPreferenceOnBuffer` once, set `finalCoverProvisionalWinner`, apply the **same** floor. Fail → human review without pack; pass → pack.

## Publish safety

`mercadolibre-image-remediation.service.ts`: `canonicalHandled.kind === 'human_review'` keeps `publishSafe` false and blocks `mayUseApprovedDiskPack` when the canonical path demands review — no silent promotion of stale packs from this failed run.

## Non-regression

Policy / conversion / hero / integrity code paths and thresholds are untouched.
