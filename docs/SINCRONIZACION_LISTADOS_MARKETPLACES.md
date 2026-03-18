# Sincronización de listados con marketplaces

La base de datos mantiene el estado de los listados publicados en eBay, MercadoLibre y Amazon. Para que ese estado coincida con la realidad de cada marketplace, el backend usa el **servicio de reconciliación de estado** (Phase 15): consulta las APIs de cada marketplace por cada listing y actualiza `MarketplaceListing.status` y `lastReconciledAt`.

## Sincronización automática (recomendada)

- **Requisito:** Tener **Redis** configurado (`REDIS_URL`). Los workers BullMQ ejecutan una reconciliación cada **30 minutos** (lote de 100 listados).
- Si Redis no está disponible en el arranque, los workers no se crean y la BD **no** se actualiza sola.
- **Variable opcional:** `RUN_LISTING_RECONCILIATION_ON_STARTUP=true` — encola una pasada de reconciliación al arrancar el servidor (además del cron cada 30 min), para que tras un deploy la BD se actualice pronto.

## Si Redis no está disponible

La BD no se sincronizará automáticamente. Opciones para sincronizar manualmente:

1. **Desde la API (usuario autenticado):**  
   `POST /api/publisher/listings/run-reconciliation-audit`  
   - Usuario normal: reconcilia solo sus listados.  
   - Admin: reconcilia todos los listados.

2. **Desde línea de comandos:**  
   ```bash
   npx tsx scripts/run-reconciliation-audit.ts
   npx tsx scripts/run-reconciliation-audit.ts https://tu-backend-url
   ```  
   Usa `AUTOPILOT_LOGIN_USER` y `AUTOPILOT_LOGIN_PASSWORD` (o admin/admin123 por defecto) para hacer login y llamar al endpoint anterior.

## Estado de sincronización

`GET /api/publisher/listings/sync-status` (autenticado) devuelve:

- `workersActive`: si Redis está disponible y los workers de reconciliación están activos.
- `listingsActive`: número de listados con `status: 'active'`.
- `listingsReconciledLast24h`: listados reconciliados en las últimas 24 h.
- `listingsNeverReconciled`: listados que nunca se han reconciliado.
- `lastReconciliationCronRun`: reservado para uso futuro.

Con esto puedes comprobar si la BD está al día con los marketplaces y si la sincronización automática está activa.
