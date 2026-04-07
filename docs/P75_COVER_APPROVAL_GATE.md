# P75 — Cover approval gate

## Command

```bash
cd backend
npx tsx scripts/check-ml-asset-visual-approval.ts 32690 --apply
```

## Result (run 2026-03-25)

- **packApproved:** `true`
- **goNoGo:** `GO_FOR_ML_IMAGE_REPLACEMENT`
- **cover_main:** `approved`, `overallPass: true`
- **detail_mount_interface:** `approved`, `overallPass: true`

## Checklist vs seller reasons

| Seller concern | Gate criterion | Result |
|----------------|----------------|--------|
| Logos/text | `no_text`, `no_watermark_logo` | pass (hybrid + prior review confirmation) |
| Plain/light background | Visual review + cleaner-than-supplier | pass |
| Size | `minimum_1200x1200` (automated on local file) | pass |

## Stricter human note

Automated gate does **not** replace MercadoLibre’s **seller-center** classifier. If ML still shows the same Spanish reasons after live upload, treat that as **seller-side truth** over local checklist pass.

## Proceed decision

**GO** — live replacement executed in `P75_LIVE_COVER_REPLACEMENT.md`.
