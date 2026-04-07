# P78 — Visual approval flow

## Prior state

Cover and detail were **`approved_by_hybrid_visual_approval_stage`** in an earlier manifest (`internal_generated` / self-hosted executor).

## After canonical `remediated_pass`

The remediation integration **writes a new manifest** with:

- **`approvalState: approved`** for required assets  
- **`assetSource: canonical_ml_pipeline_v1`**  
- **`notes`** referencing P76 dual-gate pipeline  

So **pack inspection** (`inspectMercadoLibreAssetPack`) reports **`packApproved: true`** without re-running the hybrid visual script.

## Optional: hybrid visual script

**Script:** `backend/scripts/check-ml-asset-visual-approval.ts` (existing)

Use if you want a **second** human/agent review pass on the new files; it is **not required** for `packApproved` when the canonical path has already marked assets approved in the manifest.

## P78 run result

Post-remediation: **`packApproved: true`**, **`publishSafe: true`**, dimensions/square checks satisfied by inspection.
