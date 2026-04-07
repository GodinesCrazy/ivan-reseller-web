# Checklist GO/NO-GO — Compra Real Controlada
**Fecha:** 2026-04-06  
**Fase:** 5B  
**Propósito:** Lista de verificación ANTES de ejecutar la primera compra real controlada en ML Chile.

---

## BLOQUE 1 — Infraestructura y Deploy

- [ ] Backend Railway en línea — `GET /health` responde `200 OK`
- [ ] Frontend Vercel deployado — URL pública accesible
- [ ] `/api/health` desde el frontend devuelve `200` (proxy Vercel → Railway funciona)
- [ ] Redis conectado (requerido para BullMQ y WebSocket)
- [ ] PostgreSQL conectado (Railway PostgreSQL service activo)
- [ ] Migraciones ejecutadas — `railway run node scripts/railway-migrate-deploy.js` completo
- [ ] Variables de entorno backend verificadas en Railway dashboard

## BLOQUE 2 — Configuración Mercado Libre

- [ ] `ML_ACCESS_TOKEN` válido y no expirado (probar con `GET /api/marketplace/ml/test-connection`)
- [ ] `ML_REFRESH_TOKEN` configurado (para renovación automática)
- [ ] `ML_USER_ID` correcto para ML Chile (site_id = MLC)
- [ ] Categoría del producto en allowlist — `GET /api/workflow-config/allowlist` la incluye
- [ ] Cuenta ML sin restricciones activas (verificar en ML → Mis ventas → Salud de cuenta)

## BLOQUE 3 — Producto Pilot Ready

- [ ] Producto seleccionado tiene `validationState = APPROVED` o `VERIFIED`
- [ ] Sin `blockedReasons` activos en el producto
- [ ] Imágenes del producto procesadas (no raw AliExpress — AI background removal completado)
- [ ] Precio sugerido > costo AliExpress + fees ML (margen ≥ 15%)
- [ ] Descripción y título en español (no chino/inglés crudo)
- [ ] `publishIntent = pilot` configurado (NO `production` en primera compra)

## BLOQUE 4 — Publicación Pilot Aprobada

- [ ] Pilot approval creado y persiste en DB — `GET /api/publisher/pilot-approvals`
- [ ] `pilotManualAck = true` confirmado por el operador
- [ ] Listing publicado en ML con `publishMode = local`
- [ ] `externalMarketplaceState = active` en Operations Truth
- [ ] URL del listing ML accesible públicamente (copiar y abrir en browser)

## BLOQUE 5 — Monitoreo Pre-Compra

- [ ] ControlCenter muestra listing como `PILOT_LIVE` o equivalente
- [ ] Sin warnings críticos en preflight (`GET /api/publisher/preflight/:productId`)
- [ ] `shippingTruthStatus` correcto (no `FORBIDDEN`, no `LISTING_FORBIDDEN`)
- [ ] Precio en listing ML coincide con lo configurado
- [ ] Categoría en ML es la correcta (no defaulted a genérica)

## BLOQUE 6 — Flujo de Venta y Fulfillment

- [ ] WebSocket/polling activo en `PendingPurchases` (auto-refresh cada 10s)
- [ ] Webhook ML configurado y validado — `GET /api/webhooks/ml/status`
- [ ] Capital disponible > costo AliExpress del producto (verificar en `PendingPurchases`)
- [ ] `aliexpressUrl` del producto es accesible y el item existe (no agotado)
- [ ] AliExpress API/scraper funcional — probar lookup de precio antes de comprar

## BLOQUE 7 — Abort Path

- [ ] Conoces cómo pausar el Autopilot desde `Autopilot.tsx` → botón Pause/Stop
- [ ] Conoces cómo cancelar una orden ML antes de que sea procesada
- [ ] Tienes acceso directo a Railway dashboard para reiniciar servicio si se cuelga
- [ ] Listing ML puede ser pausado manualmente desde tu cuenta ML si algo falla

## BLOQUE 8 — Tests Mínimos Pre-Compra

- [ ] `npm run test -- --run` → 34/34 PASS (desde `frontend/`)
- [ ] `npm run type-check` → 0 errores (desde `frontend/`)
- [ ] `npm run build` → ✓ built sin errores (desde `frontend/`)
- [ ] Backend build → EXIT 0 (desde `backend/`)
- [ ] `GET /health` en producción → `200 OK`

---

## Criterio GO / NO-GO

### GO si:
- Todos los ítems de Bloque 1 (infraestructura) están ✅
- Todos los ítems de Bloque 2 (ML config) están ✅
- Bloque 3 + 4 (producto pilot + aprobación) están ✅
- Bloque 7 (abort path) entendido — no necesita ser probado, solo conocido
- Bloque 8 tests pasan ✅

### NO-GO si:
- ❌ Backend no responde `/health`
- ❌ ML_ACCESS_TOKEN expirado o inválido
- ❌ Capital insuficiente para cubrir el costo AliExpress
- ❌ Listing ML no está `active` después de publicar
- ❌ AliExpress URL del producto no accesible o stock = 0
- ❌ `blockedReasons` activos en el producto
- ❌ `shippingTruthStatus = LISTING_FORBIDDEN`

---

## Restricciones para la compra controlada

1. **Producto único** — primera compra con UN solo producto, no bulk
2. **publishIntent = pilot** — nunca `production` en la primera compra
3. **Precio conservador** — margen ≥ 20% para absorber errores de estimación
4. **Operador disponible** — no ejecutar con autopilot en modo automático completo
5. **Monitorear** `OrderDetail` cada 15 min durante las primeras 2 horas post-venta

---

## Post-compra — Verificar

- [ ] `PendingPurchases` muestra la orden con datos correctos
- [ ] Compra en AliExpress ejecutada (manual o automática)
- [ ] AliExpress Order ID registrado en DB
- [ ] Tracking number enviado al comprador ML
- [ ] `Orders.tsx` muestra estado `SHIPPED` o `PURCHASED`
- [ ] Profit registrado en `Sales.tsx` (puede ser provisional hasta entrega)
