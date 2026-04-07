# P41 Binary Approval And Pack Readiness

## Approval Gate
- `cover_main` must exist and pass
- `detail_mount_interface` must exist and pass
- only then may `packApproved=true`

## Current Result
- `cover_main.exists=false`
- `detail_mount_interface.exists=false`
- `packApproved=false`
- `reviewedProofState=pending_real_files`

## Readiness Helper
- command:
  - `backend npx tsx scripts/check-ml-asset-pack-readiness.ts 32690`
- result:
  - `ready=false`
  - `packApproved=false`
  - `missingRequired=["cover_main","detail_mount_interface"]`
  - `invalidRequired=[]`
  - `unapprovedRequired=["cover_main","detail_mount_interface"]`
