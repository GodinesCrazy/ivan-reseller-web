# P64 — Listing image replacement

## Command

```text
cd backend
npx tsx scripts/check-ml-asset-pack-readiness.ts 32690
npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
```

## Picture IDs

| Phase | IDs |
|--------|-----|
| **Before** | `777356-MLC109380855063_032026`, `984076-MLC108575468668_032026` |
| **After** | `992517-MLC108576529218_032026`, `755547-MLC109381163323_032026` |

## API outcome

- **`updateError` / `activateError`:** `null`
- **`classification`:** `listing_active_policy_clean`
- **`liveItem.status`:** `active`
- **`liveItem.sub_status`:** `[]`
- **Upload byte sizes (logs):** ~70 KB / ~76 KB (vs ~44–46 KB on prior washed generation — consistent with richer JPEG entropy)

## ML dimension warnings

- **None** on this run — both returned **`1200x1200`** `max_size` (prior sprint had 1156 height warning on detail).

## Local DB

- `marketplace_listings.status` → `active`
- `products.status` → `PUBLISHED`, `isPublished` → `true` (per `p49` local sync)
