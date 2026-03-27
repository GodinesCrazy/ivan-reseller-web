# Intelligent publisher — pending queue actions (reject / remove)

## Semantics

| Action | Meaning | Persistence |
|--------|---------|-------------|
| **Rechazar** | Mark product **`REJECTED`** | Row kept; disappears from **PENDING** pending list |
| **Eliminar** | **Delete** product | Row removed; **blocked** if the product has sales (`product.service.deleteProduct`) |

Bulk operations use the same rules per product ID.

## API (authenticated, same ownership rules as approve)

Base path: `/api/publisher/...` (see `backend/src/api/routes/publisher.routes.ts`).

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/pending/reject/:productId` | optional `{ reason?: string }` | Single reject |
| `POST` | `/pending/remove/:productId` | — | Single delete (pending only) |
| `POST` | `/pending/bulk-reject` | `{ productIds: number[] }` | Bulk reject |
| `POST` | `/pending/bulk-remove` | `{ productIds: number[] }` | Bulk delete |

**Constraints:**

- Target product must be **`PENDING`**.
- Non-admin users may only act on **their** products; admin may act on all (same as `/pending` and `/approve`).

## Frontend

**File:** `frontend/src/pages/IntelligentPublisher.tsx`

- Per row: **Rechazar**, **Eliminar** (with **Eliminar** styled as destructive).
- Toolbar: **Rechazar seleccionados**, **Eliminar seleccionados** (require row checkboxes).
- **Confirm** dialogs explain reject vs delete.
- Row and bulk controls use **disabled** states while a request is in flight; **Actualizar** is disabled while row operations run.

## After actions

- Local `pending` list updates optimistically; a **silent** `loadPublisherData` reconciles with the server.
