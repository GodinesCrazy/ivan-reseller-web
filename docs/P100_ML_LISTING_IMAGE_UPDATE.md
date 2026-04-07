# P100 — Mercado Libre listing image update (MLC3804135582)

## Intended production path

- **Service:** `MercadoLibreService.replaceListingPictures(itemId, [coverPath, detailPath])`
- **Steps:** `GET` item (sanity) → if not `active`, `PUT /items/{id}` `{ status: 'active' }` → upload local files via `/pictures/items/upload` → `PUT /items/{id}` `{ pictures: [{id},…] }` → `GET` item to verify.

## Code change (ordering + fail-closed)

Previously, reactivation was attempted **after** uploads and failures were **swallowed**, leading to opaque `400` responses on the pictures `PUT`.

**Current behavior** (`mercadolibre.service.ts`):

- Load item snapshot **before** uploading binaries.
- If status is not `active`, attempt **`PUT` with `status: 'active'`** first.
- If that fails → **`AppError` 409** with ML’s message (no silent continue).
- If status still not `active` after success → **`AppError` 409**.
- Then upload and replace pictures.

## Actual runtime outcome (this environment, latest run)

| Step | Result |
| --- | --- |
| Item status before replace | **`inactive`** |
| `PUT` reactivate | **Failed** — `Cannot update item MLC3804135582 [status:inactive, has_bids:false]` |
| Picture `PUT` | **Not reached** (fail-closed after reactivation failure) |

Captured verbatim in `p100-portada-hotfix-result.json` under `putResponseSummary.error`.

## Implication

Until Mercado Libre allows the seller to return the listing to an **API-editable / active** state (typically via **seller center** moderation / policy resolution), **automated picture replacement cannot complete**.

## Next action after seller center fix

Re-run:

```bash
cd backend
npx tsx scripts/p100-hotfix-32714-portada-ml-listing.ts
```

Or manually assign the file at `artifacts/ml-image-packs/product-32714/cover_main.png` as the new portada in the ML UI (same asset the script generated).
