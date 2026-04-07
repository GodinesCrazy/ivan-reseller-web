# P71 — Listing photo replacement

**Listing:** `MLC3786354420`

## Command

```bash
cd backend
npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
```

## Picture IDs

| Phase | Cover (slot 1) | Detail (slot 2) |
|--------|----------------|-----------------|
| **Before** | `895233-MLC108580069640_032026` | `937773-MLC108580306370_032026` |
| **After** | `777265-MLC109385263977_032026` | `643864-MLC108578802150_032026` |

## Listing state

| Field | Before | After |
|--------|--------|--------|
| `status` | `under_review` | `active` |
| `sub_status` | `[waiting_for_patch]` | `[]` |
| `classification` | — | `listing_active_policy_clean` |

## Secondary preservation note

Second upload size **197366** bytes — matches prior detail uploads → **same local detail raster** re-sent; only PORTADA bytes changed (**126565** upload vs P70 cover **67819** — new cover asset).
