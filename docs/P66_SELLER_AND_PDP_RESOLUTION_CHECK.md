# P66 — Seller + PDP resolution check

## Strongest automation truth available (`p50`)

**`generatedAt`:** `2026-03-25T00:04:35.353Z`

| Check | Result |
|--------|--------|
| `liveItem.status` | `active` |
| `liveItem.sub_status` | `[]` |
| Picture IDs | `996047-MLC109382626291_032026`, `978639-MLC108576847120_032026` |
| `product.status` / `isPublished` | `PUBLISHED` / `true` |
| `listing.status` | `active` |

## Seller UI: photo warning strings

**Status:** **Not verified** — no scrape of `misarticulos` / listing editor.  
**Classification:** **`unknown_due_missing_seller_feedback`** for **“Detectamos errores…”** / **“Tienes fotos por revisar”**.

### Minimum manual confirmation (operator)

1. Open listing **MLC3786354420** in MercadoLibre **seller center** → **Photos**.  
2. Confirm whether yellow/red **photo** alerts still show.  
3. If yes, expand **each** photo row and copy any **ML-provided reason** text into the next sprint doc.

## Buyer PDP

**Automated `permalinkPublicProbe`:** `challengeShellDetected: true`, **~2433** bytes (JS challenge), **`permalinkHeadStatus` 403**.  
Same limitation as **P63** — **cannot** assert rendered PDP from `fetch` alone.

**Classification:** **`unknown_due_verification_limit`** for human-visible PDP (use real browser after challenge).

## Combined sprint classification

**Not asserted:** `seller_warning_cleared_and_pdp_ok`  
**Not asserted:** `seller_warning_persists` (requires UI)  
**API layer:** listing **active**, two pictures attached, stock restored.
