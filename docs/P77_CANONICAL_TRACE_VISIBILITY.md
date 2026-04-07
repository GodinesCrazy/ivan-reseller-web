# P77 — Canonical trace visibility

## Type extensions

**File:** `backend/src/services/marketplace-image-pipeline/types.ts`

`CanonicalPipelineTrace` now includes:

| Field | Purpose |
|--------|---------|
| `candidateInventory` | URLs/keys enumerated as main candidates |
| `rankedCandidateDetails` | Full `scores` + `combinedScore` per ranked candidate |
| `directPathGateEvaluations` | Per-candidate policy/conversion pass + `policyFailures` / `conversionFailures` |
| `remediationAttempts` | Each recipe try with **full** gate failure lists on the **output buffer** |
| `finalOutcome` | `direct_pass` \| `remediated_pass` \| `human_review_required` |
| `winningRecipeId` | Set when `finalOutcome === 'remediated_pass'` |

`rankedCandidates` remains the compact summary (backward compatible).

## Integration metadata

**Always** present under `metadataPatch.mlChileCanonicalPipeline`:

- **`executed`**: canonical run occurred (vs disabled)
- **`trace`**: full object above
- **`traceFinalOutcome`**: duplicate of `trace.finalOutcome` for quick reads
- **`appliedToPublishDecision`**: canonical outcome was applied to routing (not `none`)
- **`handledKind`**: `human_review` \| `raw_ordered` \| `pack` \| `null`
- **`unusedTraceOnlyBecauseRejectHard`**: canonical ran but publish decision stayed `reject_hard` without applying canonical handling

**`metadataPatch.mlChileImageRemediation`:**

- **`integrationLayerOutcome`**: end state for publishers (`direct_pass`, `remediated_pass`, `human_review_required`, `reject_hard`, `legacy_raw_publish_safe`, `legacy_approved_pack`, `reject_hard_stale_pack_override_publish`, `blocked`)
- **`rejectHardStalePackOverrideActive`**: boolean

## Script summary

`backend/scripts/check-ml-image-remediation.ts` prints **`p77Summary`** (counts + `traceFinalOutcome`, `winningRecipeId`, `chosenDirectUrl`) and persists **`mlChileCanonicalPipeline`** when `--persist` is used.
