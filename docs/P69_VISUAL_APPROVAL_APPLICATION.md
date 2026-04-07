# P69 — Visual approval application

## Command

```bash
cd backend
npx tsx scripts/check-ml-asset-visual-approval.ts 32690 --apply
```

## Result

| Field | Value |
|--------|--------|
| `packApproved` | **`true`** |
| `goNoGo` | **`GO_FOR_ML_IMAGE_REPLACEMENT`** |
| `cover_main` | **`approved`** (`overallPass: true`) |
| `detail_mount_interface` | **`approved`** (`overallPass: true`) |

Method: `hybrid_structural_plus_review_confirmation` (existing `ml-asset-visual-review.json` proof state).

Required automated checks (e.g. `minimum_1200x1200`) passed for both assets.
