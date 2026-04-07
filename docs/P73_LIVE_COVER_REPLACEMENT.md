# P73 — Live cover replacement

## Command

```bash
cd backend
npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
```

## Outcome (this run)

**Failed** — MercadoLibre API returned **`401` / `invalid access token`** for **`getItem`** and **image uploads**. No new picture IDs were produced.

| Field | Value |
|--------|--------|
| `updateError` | `MercadoLibre picture replacement failed: no images were uploaded successfully` |
| `classification` | `listing_update_failed` |
| `before` / `afterReplace` / `final` | **`null`** (could not read item) |

**Side effect:** `marketplace_listings` may show **`failed_publish`** until a successful `p49` after token refresh.

## Unblock

Refresh **Mercado Libre OAuth** for the product owner, then **re-run `p49`** — local pack is already **P73 clean cover** + approved detail.
