# P69 — Listing photo replacement

**Listing:** `MLC3786354420` · **Product:** `32690`

## Command

```bash
cd backend
npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
```

## Picture IDs

| Phase | Picture IDs |
|--------|----------------|
| **Before** | `996047-MLC109382626291_032026`, `978639-MLC108576847120_032026` |
| **After** (`afterReplace` = `final`) | `634094-MLC108578254556_032026`, `728696-MLC109385244991_032026` |

## Listing state

| Field | Value |
|--------|--------|
| `before.status` / `sub_status` | **`active`** / **`[]`** |
| `afterReplace.status` / `sub_status` | **`active`** / **`[]`** |
| `classification` | **`listing_active_policy_clean`** |
| `activateAttempted` | **`false`** (no extra activation needed) |
| `updateError` / `activateError` | **`null`** |

## Stock / recovery

**`p66-resume-listing-stock-and-activate.ts` was not run** — replacement did not leave the item paused or out of stock.

**Permalink:** `https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM`
