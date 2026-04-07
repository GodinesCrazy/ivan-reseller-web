# P63 — Targeted listing recovery execution

## Preconditions

```text
cd backend
npx tsx scripts/check-ml-asset-pack-readiness.ts 32690
```

Result: **`ready: true`**, **`packApproved: true`**, required assets approved on disk.

## Corrective action

```text
npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
```

Exit code: **0**

## ML API: before → after

| Phase | `status` | `sub_status` | Picture IDs |
|--------|----------|----------------|-------------|
| `before` | `under_review` | `["waiting_for_patch"]` | `630860-MLC109380016497_032026`, `635707-MLC108574302632_032026` |
| `afterReplace` / `final` | `active` | `[]` | `777356-MLC109380855063_032026`, `984076-MLC108575468668_032026` |

## Other script outputs

- **`activateAttempted`:** `false` (listing became `active` after picture replace)
- **`classification`:** `listing_active_policy_clean`
- **`updateError` / `activateError`:** `null`
- **ML warning:** second image uploaded at **1156×1200** (below 1200 square recommendation) — same class of warning as prior sprints

## Local state changes (via `p49`)

- **`marketplace_listings.status`:** → `active`
- **`products.status`:** → `PUBLISHED`, **`isPublished`:** `true`

## Moderation state

- **`waiting_for_patch` cleared** immediately after replace on authenticated `getItem` read inside `p49`.

## Scope compliance

- Single listing / product only; no catalog-wide reconcile executed.
