# Controlled Purchase Final Go/No-Go (ML Chile)
Fecha: 2026-04-06
Alcance: compra real controlada en Mercado Libre Chile (postventa mínima).

## 1) Estado de entorno (evidencia real)
- Frontend productivo: `https://www.ivanreseller.com` (200).
- Backend real detrás de Vercel rewrite: `https://ivan-reseller-backend-production.up.railway.app` (200 en `/health`, `/api/health`, `/api/ready`).
- Topología confirmada en `vercel.json`:
  - `/api/:path*` -> `https://ivan-reseller-backend-production.up.railway.app/api/:path*`
- Railway:
  - Servicio `ivan-reseller-backend` activo (deploy SUCCESS, commit `09cecd0`).
  - Redis y Postgres presentes en producción (servicios activos).
- Config segura expuesta por backend (`/config`):
  - `hasDbUrl: true`, `hasRedisUrl: true`, `env: production`.
- ML auth runtime (script real):
  - `hasAccessToken: true`
  - `hasRefreshToken: true`
  - `runtimeUsable: true`
  - `usersMe.status: 200`, `country_id: CL`

## 2) Candidato piloto auditado
Candidato principal evaluado: `productId=32714`
- Listing público accesible: `https://articulo.mercadolibre.cl/MLC-3805190796-rotating-table-cell-phone-holder-support-desktop-stand-fo-_JM` (200).
- Producto en API: `status=VALIDATED_READY`, costo/envío/impuesto presentes.
- Preflight real (`/api/products/32714/publish-preflight?...publishIntent=pilot...`) devuelve:
  - `publishAllowed: false`
  - `overallState: blocked_images`
  - Blockers:
    - `images:ml_canonical_dual_gate_failed_all_candidates_and_remediations`
    - pricing freight truth stale
  - Warnings:
    - `mercadolibre_webhook_event_flow_not_verified`
    - `mercadolibre_connector:blocked — not_configured`

## 3) Gap bloqueante corregido en código (local)
Se corrigió colisión de rutas en backend:
- Archivo: `backend/src/api/routes/sales.routes.ts`
- Cambio: `GET /api/sales/:id` -> `GET /api/sales/:id(\\d+)`
- Motivo: `GET /api/sales/pending-purchases` estaba cayendo en `/:id` y respondía 400.
- Estado: compilación backend OK tras fix.
- Nota: requiere deploy para impactar producción.

## 4) Decisión final
## NO-GO (hoy)
No ejecutar compra real controlada todavía.

### Bloqueos de entrada a GO
1. Preflight canónico del producto objetivo no permite publicar (`publishAllowed=false`).
2. Pipeline de imágenes ML en estado bloqueado (`blocked_images`).
3. Flujo postventa ML no verificado en webhook/event flow (`event_flow_not_verified`).
4. `connectorAutomationReady=false` para MLC.
5. Endpoint operativo clave (`/api/sales/pending-purchases`) corregido localmente pero aún no desplegado.

## 5) Condiciones de salida a GO
Se habilita GO solo cuando, para el producto objetivo:
1. `/api/products/:id/publish-preflight` -> `publishAllowed=true`
2. `images.publishSafe=true` y sin blockers en `data.blockers`
3. `postsale.mercadolibreEventFlowReady=true`
4. `postsale.mercadolibreConnectorAutomationReady=true`
5. Deploy aplicado con fix de `/api/sales/pending-purchases` y endpoint respondiendo 200

## 6) Protocolo operativo (ejecutar solo cuando esté GO)
1. Producto: usar `productId` que pase preflight (idealmente 32714 si queda desbloqueado).
2. Abrir antes de comprar:
   - Listing ML público
   - `/orders`
   - `/order/:id` (cuando exista)
   - `/pending-purchases`
   - `/sales`
   - `/control-center`
3. Check final inmediato:
   - `/api/products/:id/publish-preflight` OK
   - `/api/health` y `/api/ready` OK
   - `/api/orders/sync-status` visible
4. Ejecutar compra controlada en ML con buyer de prueba real.
5. Monitoreo:
   - +5 min: intake orden (`/api/orders`, `/orders`)
   - +15 min: sync marketplace (`/api/orders/sync-marketplace` / timestamp sync)
   - +30 min: estado de fulfillment (order detail, sale/status, pending-purchases)
   - +60 min: consistencia entre `orders`, `order detail`, `pending-purchases`, `sales`, `control-center`
6. Éxito mínimo:
   - orden recibida + visible
   - sync visible
   - arranque de fulfillment visible
   - trazabilidad mínima coherente en UI/API
7. Abort inmediato:
   - no intake en ventana esperada
   - discrepancia grave entre vistas canónicas
   - fallo de sync/fulfillment sin evidencia de recuperación

## 7) Evidencia a guardar
- Capturas con timestamp de:
  - listing
  - orders list
  - order detail
  - pending-purchases
  - sales
  - control-center
- JSON de endpoints clave:
  - preflight del producto
  - orders/sync-status
  - orders (con orden nueva)
  - order detail
  - sales/pending-purchases
- IDs:
  - `productId`, `listingId`, `marketplaceOrderId`, `orderId`, `saleId`
