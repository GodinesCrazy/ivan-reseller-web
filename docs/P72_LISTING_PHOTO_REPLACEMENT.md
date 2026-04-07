# P72 — Listing photo replacement

## Intended command

```bash
cd backend
npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
```

## Execution outcome (this environment)

| Attempt | Result |
|---------|--------|
| First `p49` | **Prisma** could not reach DB (`yamabiko.proxy.rlwy.net`) — **aborted** before ML calls. |
| Second `p49` | DB OK; MercadoLibre **`401` / `invalid access token`** on **`getItem`** and **image upload** → **`updateError`:** `MercadoLibre picture replacement failed: no images were uploaded successfully` · **`classification`:** `listing_update_failed` |

**Live listing pictures were not updated** in this run despite a ready local pack.

## Side effect

`p49` may have written **`marketplace_listings.status`** toward **`failed_publish`** when update fails — **reconcile** after ML OAuth refresh with a successful `p49` or manual listing check.

## Picture IDs

**Before / after (live):** **not available** — replacement did not complete. **Prior** live IDs from P71 were:

- `777265-MLC109385263977_032026` (cover)
- `643864-MLC108578802150_032026` (detail)

## Unblock

1. Refresh **Mercado Libre** OAuth / access token for the listing owner (`userId` on product `32690`).
2. Re-run **`p49`** when `getItem` succeeds.
