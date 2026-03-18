# Phase 35 — Listing sync y estado por marketplace (revisión)

## Resumen

El sistema ya incluye **sincronización y reconciliación de listados** con cada marketplace (eBay, MercadoLibre, Amazon). Esta revisión describe qué existe, cómo ejecutarlo y qué variables/configuración se usan.

---

## 1. Componentes existentes

| Componente | Ubicación | Función |
|------------|-----------|---------|
| **ListingStateReconciliationService** | `backend/src/services/listing-state-reconciliation.service.ts` | Verifica un listing contra la API del marketplace (eBay, ML, Amazon). Devuelve ACTIVE, PAUSED, NOT_FOUND o ERROR. Actualiza `MarketplaceListing.status` y registra errores en `ListingPublishError`. |
| **FullListingAuditService** | `backend/src/services/full-listing-audit.service.ts` | Auditoría completa: obtiene listados de la DB y ejecuta reconciliación por lote (opcionalmente con verificación API). |
| **ListingClassificationEngine** | `backend/src/services/listing-classification-engine.service.ts` | Clasifica resultados del audit (ACTIVE, NOT_EXISTING, REPUBLISHABLE, etc.) para decidir recuperar o eliminar. |
| **ListingRecoveryEngine** | `backend/src/services/listing-recovery-engine.service.ts` | Ejecuta la recuperación: quitar de DB los no existentes, encolar republish para los que aplique, optimizar. |
| **ScheduledTasksService** | `backend/src/services/scheduled-tasks.service.ts` | Cola `listing-state-reconciliation` (cada ~30 min) y cola `full-listing-recovery` para tareas programadas. Requiere **Redis** y que **SAFE_BOOT** no sea `true`. |

---

## 2. Endpoints para listing sync / reconciliación

Todos requieren **autenticación** (salvo que se indique lo contrario). Base URL = tu backend (ej. `https://tu-backend.up.railway.app`).

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| **POST** | `/api/publisher/listings/run-reconciliation-audit` | **Phase 15.** Ejecuta auditoría de estado: todos los listados (o por usuario si no admin) se comparan con el marketplace. Devuelve `scanned`, `corrected`, `errors`. |
| **POST** | `/api/publisher/listings/run-full-recovery` | **Phase 26.** Auditoría completa + clasificación + recuperación. Body opcional: `{ userId?, verifyWithApi?: boolean, limit?: number }`. `verifyWithApi: true` hace llamadas reales a APIs; `limit` limita cuántos listados procesar (default 500, max 2000). |
| **POST** | `/api/system/run-listing-compliance-audit` | **Phase 13.** Auditoría de cumplimiento de listados (compliance). |
| **POST** | `/api/system/phase30/self-heal` | **Phase 30.** Una pasada de self-healing: reconcilia un lote (default 50, body `batchSize` hasta 100), reintentos y recuperación. |
| **GET** | `/api/system/phase28/ready` | Comprueba si el sistema está listo (listings match, workers, métricas, profit). Query `?runFullSync=true` fuerza una sincronización completa. |

---

## 3. Flujo recomendado para “listing sync y estado correcto”

1. **Variables:** Tener configuradas credenciales por marketplace (eBay, MercadoLibre, Amazon) en DB (`ApiCredential`) o env (según cómo esté montado el proyecto).  
2. **Reconciliación rápida:**  
   `POST /api/publisher/listings/run-reconciliation-audit`  
   → Ver qué está desincronizado (scanned/corrected/errors).  
3. **Recuperación completa (opcional):**  
   `POST /api/publisher/listings/run-full-recovery`  
   Body: `{ "verifyWithApi": true, "limit": 500 }`  
   → Corrige estado en DB, elimina no existentes, encola republish donde aplique.  
4. **Mantenimiento:** Si Redis y workers están activos, la cola `listing-state-reconciliation` corre cada ~30 min. Si no, ejecutar de forma manual el reconciliation-audit o self-heal de forma periódica.

---

## 4. Mercado por mercado

- **MercadoLibre:** `ListingStateReconciliationService.verifyMercadoLibre` usa `MercadoLibreService.getItemStatus`. Refresco de token automático si falla por token expirado.  
- **eBay:** `verifyEbay` usa el servicio eBay para comprobar el listing.  
- **Amazon:** `verifyAmazon` usa `AmazonService.getListingBySku`.  

Las credenciales se obtienen vía `MarketplaceService.getCredentials(userId, marketplace, 'production')` (API credentials en DB por usuario).

---

## 5. Reparación específica ML

Para reparar listados de MercadoLibre (título, descripción, atributos):

- **POST** `/api/publisher/listings/repair-ml`  
  Body opcional: `{ listingIds?: string[], limit?: number }`.

---

## 6. Script local (opcional)

En `backend/scripts/run-reconciliation-audit.ts` hay un script que llama a `POST .../api/publisher/listings/run-reconciliation-audit`. Uso:

```bash
cd backend
npx tsx scripts/run-reconciliation-audit.ts
# o con URL explícita:
npx tsx scripts/run-reconciliation-audit.ts https://tu-backend.up.railway.app
```

(El script puede requerir auth; revisar si usa header o cookie en el repo.)

---

## Conclusión

Listing sync y estado por marketplace están implementados. Para “revisar y corregir”:

1. Llamar a **run-reconciliation-audit** para ver estado.  
2. Si hace falta, llamar a **run-full-recovery** con `verifyWithApi: true`.  
3. Asegurar **REDIS_URL** y **SAFE_BOOT=false** para que el reconciliation programado (cada ~30 min) funcione.
