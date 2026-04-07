# P70 — Cover-scoped listing replacement

## Honest API constraint

`MercadoLibreService.replaceListingPictures` issues **`PUT /items/{id}`** with a **full** `pictures: [{ id }]` array (`mercadolibre.service.ts`). There is **no** partial “replace slot 0 only” call in this codebase.

**P70 intent preserved operationally:**

- **Slot 1 (PORTADA):** new file → **new** ML picture id.
- **Slot 2:** **same local bytes** as before P70 (`detail_mount_interface.png` not rebuilt). Re-upload produces a **new** picture id but the **image content** matches the prior secondary (confirmed by upload size **197366** bytes — same as P69 second image upload).

## Command

```bash
cd backend
npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
```

## Picture IDs

| Phase | Slot order | IDs |
|--------|------------|-----|
| **Before** | cover, detail | `634094-MLC108578254556_032026`, `728696-MLC109385244991_032026` |
| **After** | cover, detail | `895233-MLC108580069640_032026`, `937773-MLC108580306370_032026` |

## Listing state

| Field | Before | After |
|--------|--------|--------|
| `status` | `under_review` | `active` |
| `sub_status` | `[waiting_for_patch]` | `[]` |
| `classification` | — | `listing_active_policy_clean` |

**`p66-resume-listing-stock-and-activate.ts`:** not required (item returned **active** without a separate activate step).

## Upload size note

- New cover upload: **67819** bytes (changed asset).
- Second image upload: **197366** bytes (matches P69 secondary upload size → **preserved raster**).
