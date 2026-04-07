# P42 Pack Readiness Result

Command run:

- `backend npx tsx scripts/check-ml-asset-pack-readiness.ts 32690`

Result:

- `ready=false`
- `packApproved=false`
- `missingRequired=["cover_main","detail_mount_interface"]`
- `invalidRequired=[]`
- `unapprovedRequired=["cover_main","detail_mount_interface"]`
- `cover_main.exists=false`
- `detail_mount_interface.exists=false`

Current publication implication:

- Listing `MLC3786354420` is not ready for manual MercadoLibre image replacement yet because the required approved asset files still do not exist.
