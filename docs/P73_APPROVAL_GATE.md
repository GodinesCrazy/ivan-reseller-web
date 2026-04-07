# P73 — Approval gate

## Command

```bash
cd backend
npx tsx scripts/check-ml-asset-visual-approval.ts 32690 --apply
```

## Result

| Field | Value |
|--------|--------|
| `cover_main` | **approved** |
| `detail_mount_interface` | **approved** |
| `packApproved` | **true** |
| `goNoGo` | **GO_FOR_ML_IMAGE_REPLACEMENT** |

## Stricter seller alignment (manual)

Automated checklist includes **no_text** / **no_watermark_logo** via hybrid review state — **OCR-level** ML moderation may still differ. Operator should **zoom** the new `cover_main.png` before trusting seller clearance.
