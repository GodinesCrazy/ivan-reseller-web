# P74 — Cover policy approval gate

## Gate purpose

Block live replacement unless the asset pack passes **hybrid** visual approval and required assets are present.

## Commands run

```bash
cd backend
npx tsx scripts/check-ml-asset-visual-approval.ts 32690 --apply
```

## Result: **PASS (GO)**

- **method:** `hybrid_structural_plus_review_confirmation`
- **packApproved:** `true`
- **goNoGo:** `GO_FOR_ML_IMAGE_REPLACEMENT`

### cover_main

- **outcome:** `approved`, **overallPass:** `true`
- Checklist highlights: `no_text` pass, `no_watermark_logo` pass, `minimum_1200x1200` pass (automated dimensions on local file), composition passes via review confirmation.

### detail_mount_interface

- **outcome:** `approved`, **overallPass:** `true`
- Same checklist pattern; **unchanged** from prior pack except cover refresh.

### usage_context_clean

- Still **`present_unapproved`** / optional — **not** in `p49` upload order (only required approved assets).

## P74-specific policy intent (seller reasons)

| Requirement | How verified |
|-------------|--------------|
| No visible text | Hybrid checklist `no_text` + remediation crop |
| No visible logos | Hybrid checklist `no_watermark_logo` |
| Light/plain background | Remediation white canvas + high mean luminance on output |
| Centered product / protagonist | Checklist + centered composite on 1536 canvas |
| Catalog-safe | De-sat / brightness modulate per pipeline |

## Proceed decision

Gate **allowed** live replacement after P74 build and `--apply` refresh of review metadata.
