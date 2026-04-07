# P36 Reviewed Proof Finalization Prep

Date: 2026-03-23
Listing: `MLC3786354420`
Product: `32690`

## Objective

Move reviewed-proof from generic pending state to exact ready-to-write state once a final approved replacement cover exists.

## Current State

Status: `PARTIAL`

Reviewed-proof cannot be finalized in this sprint because:

- approved `cover_main` file does not exist
- approved `detail_mount_interface` file does not exist
- final approved cover URL is not known

Therefore `mlChileImageCompliance.status=ml_image_policy_pass` must not be written yet.

## Pending Metadata Payload

The exact payload is prepared, but remains in upload-pending state:

```json
{
  "mlChileImageCompliance": {
    "status": "ml_image_policy_pass",
    "reviewedAt": "<real ISO timestamp at approval time>",
    "reviewedBy": "ivan_reseller_operator",
    "assetSource": "manual_replacement",
    "primaryImageUrl": "<pending upload URL or local approved cover path placeholder>",
    "visualSignals": []
  }
}
```

## Current Truth

Current readiness state:

- `reviewed_proof_state = pending_real_files`
- `approved_cover_exists = false`
- `approved_detail_exists = false`
- `cover_url_known = false`

## Finalization Trigger

Reviewed-proof may move to ready-to-write only after all of the following are true:

1. `cover_main` exists
2. `detail_mount_interface` exists
3. both assets pass the binary approval checklist
4. the final approved cover upload URL is known or the exact accepted local handoff path is recorded for upload

