# Products delete action — production proof

## What to verify after frontend deploy

1. Open **Products** → each row shows the trash icon.
2. Click → modal appears with title **Eliminar producto** and warning text.
3. **Cancelar** closes without request.
4. **Eliminar** calls `DELETE /api/products/:id`, shows toast, list refreshes.
5. Product with sales: API returns 400 → toast shows server error message.

## Note

Earlier builds already had a delete button with **native `confirm()`** only. This revision replaces it with an explicit modal for operational clarity.
