# P75 — Live cover replacement

## Command

```bash
cd backend
npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
```

## Final successful run (2026-03-25, ~00:22 local)

### Picture IDs — BEFORE (this run)

| Slot | picture id | max_size (API string) |
|------|------------|------------------------|
| 1 | `709930-MLC108584679468_032026` | 492×1200 |
| 2 | `954621-MLC108588621134_032026` | 1200×1200 |

### Picture IDs — AFTER

| Slot | picture id | max_size (API string) |
|------|------------|------------------------|
| 1 | `929250-MLC109395338087_032026` | **459×1200** |
| 2 | `834321-MLC108588622436_032026` | 1200×1200 |

### Listing state

- **status:** `active`
- **sub_status:** `[]`
- **classification:** `listing_active_policy_clean`

## Upload warnings (MercadoLibre client)

For **portada** upload:

- `Uploaded image has low resolution, ML may reject it` — tied to API `max_size` width **459**.
- `Cover image below 1200x1200 recommended by ML` — same field.

**Local file** remains **1536×1536** PNG before `processBuffer`; the **`max_size`** value appears to reflect **ML’s internal subject / variant sizing**, not the raw canvas width.

## Permalink

`https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM`
