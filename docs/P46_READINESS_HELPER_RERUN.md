# P46 Readiness Helper Rerun

## Commands

- `backend npx tsx scripts/check-ml-asset-visual-approval.ts 32690 --apply`
- `backend npx tsx scripts/check-ml-asset-pack-readiness.ts 32690`

## Final Result

- `ready=true`
- `packApproved=false`
- `missingRequired=[]`
- `invalidRequired=[]`
- `unapprovedRequired=["cover_main","detail_mount_interface"]`

## Required Asset State

- `cover_main.exists=true`
- `detail_mount_interface.exists=true`
- both required files remain `present_unapproved`
