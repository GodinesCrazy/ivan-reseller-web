# P101 — Live Mercado Libre portada validation (32714)

**Listing:** `MLC3804623142`  
**Permalink:** `https://articulo.mercadolibre.cl/MLC-3804623142-rotating-table-cell-phone-holder-support-desktop-stand-fo-_JM`

## Honest limits

- Validation uses the **public Items API** (`GET /items/{id}`) and fields returned there. This does **not** replace seller-center moderation queues or delayed policy actions that may not appear on the item JSON immediately.

## Observations immediately after publish

From `p101-republish-result.json` → `mlItemVerification` / `liveListingValidation` (timestamp aligned with publish ~ `2026-03-27T02:35:48Z`):

| Signal | Value |
|--------|--------|
| `status` | `active` |
| `sub_status` | `[]` (empty) |
| `warnings` (top-level array on item) | `[]` |
| `tags` | includes `good_quality_thumbnail` (not `poor_quality_thumbnail`) |
| `pictures` | 2 entries (portada + gallery) with ML CDN URLs |
| First picture `max_size` | `1102x1103` (ML-processed derivative of uploaded portada) |
| Second picture `max_size` | `1200x1200` |

## Classification vs mission rubric

- **Not** “failed at creation” — listing created successfully; HTTP item fetch succeeds.
- **Not** “published but under review” on the item resource — `status: active`, no `sub_status` flags in the payload we received.
- **Not** “published but image-observed/restricted” **in the item JSON** — `warnings` empty; thumbnail tag suggests ML accepted thumbnail quality at this snapshot.
- **Residual risk:** asynchronous or backend-only moderation not exposed on `/items` could still change state later; the system cannot disprove that from this probe alone.

## Contrast with obsolete listing

Prior item **MLC3804135582** (when probed during an earlier failed attempt) showed `inactive`, `sub_status: ["waiting_for_patch","deleted"]`, and tag `poor_quality_thumbnail`. That item is **out of scope** for current operations per operator direction; the new item id above is the one to track.
