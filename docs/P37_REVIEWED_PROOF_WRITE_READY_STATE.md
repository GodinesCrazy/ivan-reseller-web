# P37 Reviewed-Proof Write-Ready State

Date: 2026-03-23
Listing: `MLC3786354420`
Product: `32690`

## Objective

Prepare the exact reviewed-proof transition once the required files are approved.

## Current Classification

Status: `PARTIAL`

Current state:

- `pending_real_files`

Reason:

- required final image files do not exist yet

## Final Payload

The final reviewed-proof payload is:

```json
{
  "mlChileImageCompliance": {
    "status": "ml_image_policy_pass",
    "reviewedAt": "<real ISO timestamp at final approval>",
    "reviewedBy": "ivan_reseller_operator",
    "assetSource": "manual_replacement",
    "primaryImageUrl": "<upload URL or approved local cover placeholder before upload>",
    "visualSignals": []
  }
}
```

## When It May Be Written

The payload may be written only when:

1. `cover_main` exists
2. `detail_mount_interface` exists
3. both required assets pass the binary approval checklist

## What Still Remains Pending

Even after files exist and pass approval, the following may remain pending until upload:

- final MercadoLibre-hosted `primaryImageUrl`

## State Model

- `pending_real_files`
  required files do not exist yet
- `files_ready_pending_manual_upload`
  approved files exist, but upload URL is not known yet
- `reviewed_proof_write_ready`
  approved files exist and the write-safe metadata can be committed

## Current Truth

- `cover_main exists = false`
- `detail_mount_interface exists = false`
- `packApproved = false`
- `write_ready_state = pending_real_files`

