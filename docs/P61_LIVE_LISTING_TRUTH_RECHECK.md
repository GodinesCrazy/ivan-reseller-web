# P61 — Live Listing Truth Recheck

Listing: **MLC3786354420**  
Product: **32690**  
User: **1**

## Commands

```bash
cd backend
npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420
```

(Uses `MercadoLibreService.getItem` + `searchRecentOrders` — same code path that previously failed with 401 when tokens were invalid.)

## Live MercadoLibre item (API truth)

Captured at `generatedAt`: **2026-03-24T21:43:16.629Z**

| Field | Value |
|--------|--------|
| `id` | MLC3786354420 |
| `status` | **under_review** |
| `sub_status` | **["waiting_for_patch"]** |
| `permalink` | `https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM` |
| `title` | (truncated in log) Soporte Organizador De Enchufes… |
| Pictures | 2 images present in payload |

## Permalink HTTP probe (HEAD)

Script-reported `permalinkHeadStatus`: **403**

- Interpretation: **inconclusive for human “site down”** — MercadoLibre often returns **403** to automated `fetch`/HEAD without browser-like clients. Earlier sprints (e.g. P50) recorded **200** via different clients.
- **Do not** classify listing as “not_found” from this alone.

## Recent orders (ML API, item-scoped filter in script)

- `matchingRecentOrders.count`: **0**

## ML API errors this run

- **None** on `getItem` / `searchRecentOrders` (auth fixed vs prior 401).

## Classification (sprint taxonomy)

**waiting_for_patch** — live item is **under_review** with **`waiting_for_patch`**. Not **active_and_sellable**. Not **not_found**. Not **unknown_due_auth** (auth succeeded).
