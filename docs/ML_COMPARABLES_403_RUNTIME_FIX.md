# ML comparables — 403 y orden de rutas

## Causa

La ruta **pública** de búsqueda es la que más suele bloquearse por IP; el token de usuario usa el mismo path `/sites/{id}/search` con `Authorization`, que a menudo **sí** responde.

## Cambio

1. **`competitor-analyzer.service.ts`:** Primero `MercadoLibreService.searchProducts` (OAuth) para `siteId` regional y **MLM**; si sigue vacío, catálogo público y reintento MLM.
2. **`probeMercadoLibreOpportunityComparables`:** Misma prioridad; además usa credenciales con token aunque `users/me` aún no marque `isAvailable` en edge cases.
3. Mensajes de probe y `competitionProbe` actualizados para reflejar el orden real.
