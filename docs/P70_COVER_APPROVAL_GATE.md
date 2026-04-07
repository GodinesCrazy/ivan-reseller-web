# P70 — Cover approval gate

## Command

```bash
cd backend
npx tsx scripts/check-ml-asset-visual-approval.ts 32690 --apply
```

## Result (P70)

| Asset | Outcome |
|--------|---------|
| `cover_main` | **approved** — all checklist items **pass** (including `no_text`, `no_watermark_logo`, `no_collage_split`, `product_protagonist`, `minimum_1200x1200` automated) |
| `detail_mount_interface` | **approved** (unchanged file; re-validated) |

| Gate | Value |
|------|--------|
| `packApproved` | **true** |
| `goNoGo` | **GO_FOR_ML_IMAGE_REPLACEMENT** |

## Stricter human bar (operator)

Automation reuses the existing hybrid gate. For P70, the **new cover** must also be **visually cleaner** than the seller-flagged portada; operator should confirm in seller UI after publish.
