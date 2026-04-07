# P45 Asset Pack Status

## Readiness Command

- `backend npx tsx scripts/check-ml-asset-pack-readiness.ts 32690`

## Final Sequential Result

- `ready=true`
- `packApproved=false`
- `missingRequired=[]`
- `invalidRequired=[]`
- `unapprovedRequired=["cover_main","detail_mount_interface"]`

## Required Asset State

- `cover_main.exists=true`
- `cover_main.width=1536`
- `cover_main.height=1536`
- `cover_main.squareLike=true`
- `cover_main.min1200=true`
- `cover_main.approvalState=present_unapproved`

- `detail_mount_interface.exists=true`
- `detail_mount_interface.width=1536`
- `detail_mount_interface.height=1536`
- `detail_mount_interface.squareLike=true`
- `detail_mount_interface.min1200=true`
- `detail_mount_interface.approvalState=present_unapproved`

## Interpretation

- The self-hosted activation solved the missing-file blocker.
- The pack is upload-ready at the file/dimension level.
- The pack is still not approved for publication because the fail-closed review gate kept the required assets in `present_unapproved`.
