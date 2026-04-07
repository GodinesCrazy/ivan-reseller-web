# P65 — Listing image replacement

## Commands

```text
cd backend
npm run type-check
npx tsx scripts/check-ml-asset-pack-readiness.ts 32690
npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
```

## Picture IDs

| Phase | IDs |
|--------|-----|
| **Before** | `992517-MLC108576529218_032026`, `755547-MLC109381163323_032026` |
| **After** | `643675-MLC109382559801_032026`, `748128-MLC109382649837_032026` |

## Listing state

| Field | Before replace | After replace |
|--------|----------------|---------------|
| `status` | `under_review` | `active` |
| `sub_status` | `["waiting_for_patch"]` | `[]` |

## Upload telemetry (logs)

- Picture 1: **117 914** bytes → `643675-MLC109382559801_032026`, `max_size` **1200×1200**
- Picture 2: **81 538** bytes → `748128-MLC109382649837_032026`, `max_size` **1200×1200**

## API errors

- `updateError` / `activateError`: **null**
- `classification`: `listing_active_policy_clean`

## Local sync (`p49`)

- `marketplaceListingStatus`: `active`
- `productStatus`: `PUBLISHED`, `isPublished`: `true`
