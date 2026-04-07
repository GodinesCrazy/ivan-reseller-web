# P76 — Human review / fail-closed flow

## Fail-closed state

When **`runMlChileCanonicalPipeline`** returns **`human_review_required`**:

- **`runMercadoLibreImageRemediationPipeline`** sets **`decision: manual_review_required`**, **`remediationPathSelected: canonical_pipeline_v1`**, **`publishSafe: false`**.
- **Legacy** paths (`internal_process_existing_images`, `internal_generated_asset_pack`) are **not** executed — avoiding “silent weak” publication after canonical rejection.
- **Stale disk packs**: even if `inspectMercadoLibreAssetPack` reports `packApproved: true` from an earlier run, the branch **`assetPack.packApproved && canonicalHandled.kind !== 'human_review'`** prevents treating that pack as publish-safe.

## Operator-facing signals

- **`blockingReasons`**: includes canonical reasons (e.g. `ml_canonical_no_candidates_after_enumeration`, `ml_canonical_all_candidate_downloads_failed`, `ml_canonical_dual_gate_failed_all_candidates_and_remediations`).
- **`metadataPatch.mlChileCanonicalPipeline`**: `handled: 'human_review'`, `humanReviewReasons`, full **`trace`** (steps, ranked candidates, remediation attempts).

## Manual override expectations

- Operators must **replace or fix** source imagery, adjust **`mlImagePipeline.insetCrop`** when inset recipe is required, or **approve a new asset pack** through existing ML asset workflows **after** addressing gate failures. The system does not auto-publish a non-dual-gate-passing cover from this path.

## Optional asset

- **`usage_context_clean`** remains optional; canonical v1 may leave it missing with prompts written for optional generation.
