# P62 — Local / remote truth alignment

**Scope:** Product `32690`, MercadoLibre listing `MLC3786354420` only.

## After `p49-reactivate-ml-listing.ts`

| Source | Product | Listing row |
|--------|---------|----------------|
| **Live ML** (`getItem`) | N/A | `status: active`, `sub_status: []` |
| **`marketplace_listings`** | N/A | `status: active` (updated by `p49`) |
| **`products`** | `status: PUBLISHED`, `isPublished: true`, `publishedAt` set | N/A |

## After `p50` monitor (read-only for listing/product)

Two consecutive runs (`2026-03-24T22:12:21.027Z`, `2026-03-24T22:12:37.851Z`) showed **no drift** between:

- `liveItem.status` / `sub_status`
- `listing.status`
- `product.status` / `isPublished`

## Reconcile commands

- **No additional listing-scoped reconcile** was required beyond what `p49` already wrote.
- **Deliberately not run:** broad operational reconcile (e.g. catalog-wide `p0-reconcile-operational-truth --execute`) — out of scope for this single-listing sprint.

## Minimal correction summary

**None pending** for this product/listing after successful `p49`; local and remote alignment matches for the fields above.
