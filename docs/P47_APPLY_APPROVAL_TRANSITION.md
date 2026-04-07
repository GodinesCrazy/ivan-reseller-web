# P47 Apply Approval Transition

## Commands

- `backend npm run type-check`
- `backend npx tsx scripts/check-ml-asset-visual-approval.ts 32690 --apply`
- `backend npx tsx scripts/check-ml-asset-pack-readiness.ts 32690`

## Approval Transition Result

- `cover_main` -> `rejected_needs_regeneration`
- `detail_mount_interface` -> `rejected_needs_regeneration`
- `packApproved=false`
- `reviewedProofState=pending_real_files`
- `goNoGo=NOT_READY_REGENERATION_REQUIRED`

## Readiness Result

- `ready=true`
- `packApproved=false`
- `missingRequired=[]`
- `invalidRequired=[]`
- `unapprovedRequired=["cover_main","detail_mount_interface"]`

## P47 Conclusion

- the native review-confirmation mechanism is now satisfied
- the assets were rejected honestly
- the remaining path is regeneration, not approval
