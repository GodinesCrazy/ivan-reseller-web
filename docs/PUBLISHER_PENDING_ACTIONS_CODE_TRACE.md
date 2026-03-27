# Publisher pending actions — code trace

## Frontend

| Item | Detail |
|------|--------|
| **Page / route** | `Route path="publisher"` in `frontend/src/App.tsx` (lazy import) |
| **Component** | `frontend/src/pages/IntelligentPublisher.tsx` — default export `IntelligentPublisher` |
| **Pending row UI** | Inner component `PendingProductCard` in the same file |

### UI that renders reject / remove

- **Bulk toolbar** (above pending list): buttons **«Rechazar seleccionados»**, **«Eliminar seleccionados»** (with `Trash2` icon).
- **Per row** (right column of each pending card): **«Rechazar»**, **«Eliminar»**, alongside **«Aprobar y publicar»**.

### Client API calls

| Action | HTTP | Path |
|--------|------|------|
| Reject one | `POST` | `/api/publisher/pending/reject/:productId` |
| Remove one | `POST` | `/api/publisher/pending/remove/:productId` |
| Bulk reject | `POST` | `/api/publisher/pending/bulk-reject` body `{ productIds: number[] }` |
| Bulk remove | `POST` | `/api/publisher/pending/bulk-remove` body `{ productIds: number[] }` |

(Paths go through the existing Axios `api` client and Vercel rewrite to Railway.)

## Backend

**File:** `backend/src/api/routes/publisher.routes.ts` (router mounted under `/api/publisher` with `authenticate`).

| Route | Handler semantics |
|-------|-------------------|
| `POST /pending/reject/:productId` | `updateProductStatusSafely(…, 'REJECTED', …)`; only `PENDING` |
| `POST /pending/remove/:productId` | `productService.deleteProduct` when `PENDING` |
| `POST /pending/bulk-reject` | Iterates IDs, same reject rules |
| `POST /pending/bulk-remove` | Iterates IDs, same delete rules |

Supporting release work (rate limit / JWT) lives in `backend/src/middleware/optional-jwt-user.middleware.ts` and `backend/src/app.ts` — not required for buttons to render, but part of the same `main` commit family.
