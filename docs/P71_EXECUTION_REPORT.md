# P71 — Execution report

**Mission:** Deliberate **PORTADA** rotation on **`MLC3786354420`** using enriched supplier URLs; exclude P69/P70 cover keys and detail key.

## New script

- **`backend/scripts/p71-rotate-cover.ts`** — inventory, **rank** eligible candidates (`pixels × meanRgb/255`), rebuild **cover only**, append **`USED_COVER_KEYS`** after P71 deploy.

## Commands run

| Step | Command | Outcome |
|------|---------|---------|
| Type-check | `npm run type-check` | Pass |
| Rotate cover | `npx tsx scripts/p71-rotate-cover.ts 32690` | Selected **`sd8adf1f1…`** |
| Approval | `npx tsx scripts/check-ml-asset-visual-approval.ts 32690 --apply` | `packApproved: true` |
| Replace | `npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420` | `listing_active_policy_clean` |

## Objective

| Target | Result |
|--------|--------|
| Rotate to new real supplier cover | **Done** (`sd8adf1f1…`) |
| Seller warning cleared | **Unknown** — operator recheck (`docs/P71_SELLER_WARNING_RECHECK_PATH.md`) |
| Isolate next choice if needed | **Done** — remaining keys **`sc2ae6d7315…`**, **`seebee46…`** (`docs/P71_FALLBACK_IF_COVER_ROTATION_STILL_FAILS.md`) |

## Doc index

- `docs/P71_COVER_CANDIDATE_INVENTORY.md`
- `docs/P71_NEXT_BEST_COVER_SELECTION.md`
- `docs/P71_COVER_ONLY_REBUILD.md`
- `docs/P71_APPROVAL_GATE.md`
- `docs/P71_LISTING_PHOTO_REPLACEMENT.md`
- `docs/P71_SELLER_WARNING_RECHECK_PATH.md`
- `docs/P71_FALLBACK_IF_COVER_ROTATION_STILL_FAILS.md`
- `docs/P71_EXECUTION_REPORT.md` (this file)
