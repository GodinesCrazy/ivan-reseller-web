# P62 — Targeted recovery execution

**Correction outcome label:** `image_replacement_reapplied` + `reactivation_attempted` (script: `p49-reactivate-ml-listing.ts`; separate `activate` call **not** required).

## Commands executed

```text
cd backend
npx tsx scripts/check-ml-asset-pack-readiness.ts 32690
npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
```

(`check-ml-asset-pack-readiness` — preflight; `packApproved: true`.)

## Asset pack used

- `cover_main.png` → uploaded as picture `630860-MLC109380016497_032026` (`max_size` `1200x1200`)
- `detail_mount_interface.png` → uploaded as picture `635707-MLC108574302632_032026` (`max_size` `1156x1200`)

Runtime logged a **warning** for the second image: pipeline flagged "below 1200x1200 recommended" for `1156x1200`; upload still succeeded and ML returned `active`.

## ML API snapshot: before → after replace → final

| Phase | `status` | `sub_status` | Picture IDs |
|--------|----------|--------------|-------------|
| `before` | `under_review` | `["waiting_for_patch"]` | `614677-MLC109297138823_032026`, `706701-MLC108496629126_032026` |
| `afterReplace` | `active` | `[]` | `630860-MLC109380016497_032026`, `635707-MLC108574302632_032026` |
| `final` | `active` | `[]` | same as `afterReplace` |

## Script classification

- `activateAttempted`: `false`
- `updateError` / `activateError`: `null`
- `classification`: `listing_active_policy_clean`

## Local sync performed by `p49`

- `marketplaceListingStatus`: `active`
- `productStatus`: `PUBLISHED`
- `productIsPublished`: `true`

## Not applicable

- `no_op_not_needed` — **no**; replacement was required and executed.
- `blocked_by_ml` / `blocked_by_runtime` — **no** for this run; script exited `0` and ML accepted the patch.
