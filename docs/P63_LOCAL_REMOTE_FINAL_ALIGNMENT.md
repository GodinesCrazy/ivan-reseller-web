# P63 — Local / remote final alignment

**Verification time:** `p50` output `2026-03-24T22:56:18.586Z`

## Matrix

| Layer | Value |
|--------|--------|
| ML API `liveItem.status` | `active` |
| ML API `liveItem.sub_status` | `[]` |
| `marketplace_listings.status` | `active` |
| `products.status` | `PUBLISHED` |
| `products.isPublished` | `true` |

## Reconcile actions

- **Listing-scoped correction:** Completed inside **`p49-reactivate-ml-listing.ts`** (updates `marketplace_listings` + product publish fields when classification is `listing_active_policy_clean`).
- **Additional DB reconcile:** **Not required** for this product/listing after `p49`.

## Note on `publishedAt`

`publishedAt` remained the earlier timestamp from a prior publish (`2026-03-24T22:12:01.874Z` in the observed row); `p49`/`productService` path did not need to reset it for alignment with ML `active`.

## Drift watch

If **`marketplace_listings.status`** flips to `failed_publish` again while API stays `active`, treat as **local stale row** and re-run listing-scoped tooling — **do not** infer API state from that column alone without `getItem`.
