# P72 — Approval gate

## Command

```bash
cd backend
npx tsx scripts/check-ml-asset-visual-approval.ts 32690 --apply
```

## Result

| Asset | Outcome |
|--------|---------|
| `cover_main` | **approved** (`overallPass: true`) |
| `detail_mount_interface` | **approved** |
| `packApproved` | **true** |
| `goNoGo` | **GO_FOR_ML_IMAGE_REPLACEMENT** |

Local pack is **valid** for MercadoLibre upload once API credentials work.
