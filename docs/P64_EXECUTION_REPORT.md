# P64 — Execution report

**Scope:** Product **32690**, listing **MLC3786354420** only — **buyer-visible image washout** on PDP.

## Commands

| Step | Command | Result |
|------|---------|--------|
| Type-check | `npm run type-check` | Exit **0** |
| Pack readiness | `npx tsx scripts/check-ml-asset-pack-readiness.ts 32690` | `ready: true` |
| Local audit | `npx tsx scripts/p64-audit-pack-images.ts` | Washed metrics pre-fix; strong contrast post-fix |
| Build fix | `npx tsx scripts/p64-build-contrast-fixed-pngs.ts` | `_p64.png` outputs |
| Promote files | PowerShell copy `*_p64.png` → canonical `.png` + backups | Done |
| Replace on ML | `npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420` | `active` / `[]`, new picture IDs |

## New helper scripts (repo)

- `backend/scripts/p64-audit-pack-images.ts` — pack PNG + pipeline stats.
- `backend/scripts/p64-build-contrast-fixed-pngs.ts` — contrast normalization export.
- `backend/scripts/p64-stats-remote-jpeg.ts` — remote JPEG luminance audit.

## Outcome

- **Root cause:** Near-uniform **near-white** rasters (mean RGB ~246, stdev ~7) → **invisible** on white PDP.
- **Fix:** Histogram normalize + modest saturation on **two** required PNGs, re-upload via **`p49`**.
- **Proof:** ML CDN JPEGs for new IDs show **stdev ~40.5** and **mean ~200**, matching corrected locals; old IDs stayed **stdev ~7**.

## Human follow-up

One **visual** pass in a real browser recommended to confirm taste/composition (automation proves **contrast**, not **art direction**).

## Doc index

- `docs/P64_LIVE_IMAGE_RENDER_DIAGNOSIS.md`
- `docs/P64_LOCAL_ASSET_INTEGRITY_AUDIT.md`
- `docs/P64_CORRECTIVE_PATH_SELECTION.md`
- `docs/P64_TARGETED_IMAGE_CORRECTION.md`
- `docs/P64_LISTING_IMAGE_REPLACEMENT.md`
- `docs/P64_BUYER_FACING_VISUAL_VERIFICATION.md`
- `docs/P64_LOCAL_REMOTE_MEDIA_ALIGNMENT.md`
- `docs/P64_EXECUTION_REPORT.md` (this file)
