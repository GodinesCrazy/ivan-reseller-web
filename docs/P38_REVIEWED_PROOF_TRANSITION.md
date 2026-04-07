# P38 Reviewed-Proof Transition

Date: 2026-03-23
Listing: `MLC3786354420`
Product: `32690`

## Objective

Move the asset state from `pending_real_files` to a write-safe reviewed-proof state if conditions are met.

## Result

Status: `PARTIAL`

The transition could not advance because the required real files still do not exist in the locked pack directory.

## Current State

- `reviewed_proof_state = pending_real_files`

## Why The State Did Not Advance

- `cover_main` does not exist in the locked pack folder
- `detail_mount_interface` does not exist in the locked pack folder
- `packApproved = false`

## Write-Safe Payload

The final payload remains prepared but must not be written:

```json
{
  "mlChileImageCompliance": {
    "status": "ml_image_policy_pass",
    "reviewedAt": "<real ISO timestamp at approval time>",
    "reviewedBy": "ivan_reseller_operator",
    "assetSource": "manual_replacement",
    "primaryImageUrl": "<pending upload URL or approved local path placeholder>",
    "visualSignals": []
  }
}
```

## Allowed Next State

The next valid state may only be:

- `files_ready_pending_manual_upload`

but only after:

1. `cover_main` exists
2. `detail_mount_interface` exists
3. both required files pass the binary approval gate

