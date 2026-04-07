# P40 Image Approval And Reviewed Proof

## Approval Logic
- required assets:
  - `cover_main`
  - `detail_mount_interface`
- optional:
  - `usage_context_clean`

## Approval Rule
- `packApproved=true` only if both required assets:
  - exist
  - satisfy min size / square-like checks
  - are marked `approved`

## Current State For 32690
- `cover_main`: missing
- `detail_mount_interface`: missing
- `usage_context_clean`: missing
- `packApproved=false`
- `reviewedProofState=pending_real_files`

## Transition Rule
- `pending_real_files` while required files are absent
- `files_ready_pending_manual_upload` once required files exist and are approved
- `reviewed_proof_write_ready` only after upload/write-safe conditions are met
