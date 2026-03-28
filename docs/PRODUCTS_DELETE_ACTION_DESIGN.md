# Products — delete / remove action

## Semantics

- **HTTP:** existing `DELETE /api/products/:id` (`backend/src/api/routes/products.routes.ts`).
- **Authorization:** owner or admin via `productService.deleteProduct` → `getProductById` with `isAdmin`.
- **Business rule:** rejection if `sale` rows exist for the product (`No se puede eliminar un producto con ventas asociadas`).

## UI (`frontend/src/pages/Products.tsx`)

- Per-row **Eliminar** opens a **modal** (no native `confirm()` only).
- Copy explains irreversibility and the sales constraint.
- **Loading:** `deleteLoading` disables buttons during the request.
- **Spam prevention:** single in-flight delete (`deleteLoading`).

## Admin vs user

- Backend already allows **owner** (non-admin) to delete own products without sales.
- Tooltip clarifies admin/dueño; no extra privilege required beyond existing API.
