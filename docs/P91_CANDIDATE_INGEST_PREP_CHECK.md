# P91 — Candidate ingest / prep check

## Chosen candidate (fixed)

| Field | Value |
|--------|--------|
| AliExpress productId | `1005009130509159` |
| Variant intent | **gray** |
| Supplier URL | `https://es.aliexpress.com/item/1005009130509159.html` |

## ProductId linkage / URL parsing (proven in this sprint)

- Adapter regex in `backend/src/services/adapters/aliexpress-supplier.adapter.ts` (`ALIEXPRESS_ITEM_ID_REGEX`) extracts numeric id from `/item/{id}.html` paths.
- **Evidence:** Node check on the exact URL → **`1005009130509159`** (matches chosen id).

**Recommendation for storage:** persist a canonical `aliexpressUrl` the backend already accepts, e.g. `https://www.aliexpress.com/item/1005009130509159.html` or the provided `es.` URL — both parse to the same id.

## Variant “gray” in this codebase

- Color/variant is **not** a separate first-class column; it maps to **`aliexpressSku`** (Dropshipping API `skuId`) on `Product`, used by preventive supplier validation and fulfill paths.
- **Not executed here:** live `getProductInfo('1005009130509159', { localCountry: 'CL', ... })` to list SKUs and pick the **gray** `skuId` (requires `userId` + AliExpress Dropshipping credentials).

## Repository / DB presence

- **Grep** across workspace: **no** existing reference to `1005009130509159`.
- **This sprint did not** create or update a `Product` row (no authenticated `POST /api/products` to a live DB from this session).

## Required fields for a valid `Product` (API shape)

From `products.routes.ts` `createProductSchema` (minimal):

- `title`, `aliexpressUrl`, `aliexpressPrice` (>0), `suggestedPrice` (>0), …  
- For gray: set **`aliexpressSku`** after resolving gray’s `skuId` from the DS API.

## Images / pricing inputs

- **Images:** typically populated from scrape/API enrichment flows or manual `imageUrls`; not fetched for this SKU in this sprint.  
- **Pricing:** `suggestedPrice` / `finalPrice` / preventive economics require supplier + freight truth for CL if publishing to MLC — **live API not called** here.

## Section verdict

| Check | Result |
|--------|--------|
| URL → productId | **PASS** (regex + spot check) |
| Variant gray → `aliexpressSku` | **NOT DONE** (needs live DS `getProductInfo`) |
| Row in system | **NOT PRESENT** / **NOT CREATED** this sprint |
| Usable images/pricing | **NOT VERIFIED** for this SKU |

**P91 Section 1 status:** **PARTIAL** — linkage rules verified; **no end-to-end ingest artifact** for the candidate in DB.
