# Frontend Surface Map — Sistema Ivan Reseller
**Fecha:** 2026-04-06 | Estado: POST-ARMONIZACIÓN TOTAL

---

## Sistema Visual Canónico

### Lifecycle Badges (componente: `LifecycleBadge`)
| Stage key | Label | Tono | Cuándo |
|-----------|-------|------|--------|
| `sourced` | Sourced | neutral (gris) | Detectado, sin evaluación |
| `evaluation` | Approved / queued | info (azul) | Aprobado internamente |
| `preflight_blocked` | Preflight blocked | danger (rojo) | Bloqueado por preflight |
| `ready_local` | Ready local | success (verde) | Listo para ML Chile |
| `ready_international` | Ready international | info (azul) | Listo para exp. internacional |
| `pilot_pending_approval` | Pilot approval pending | warning (ámbar) | Esperando aprobación manual |
| `pilot_ready` | Pilot approved | success (verde) | Piloto en verde |
| `pilot_blocked` | Pilot blocked | danger (rojo) | Piloto bloqueado |
| `published_under_review` | Moderated / under review | warning (ámbar) | ML en revisión |
| `listed_active` | Listed active | success (verde) | Activo en ML |
| `listed_paused` | Listed paused | warning (ámbar) | Pausado en ML |
| `published_failed` | Publish failed | danger (rojo) | Fallo de publicación |
| `order_received` | Order received | info (azul) | Orden ingerida |
| `fulfillment_in_progress` | Fulfillment in progress | info (azul) | Compra al proveedor verificada |
| `shipped` | Shipped | info (azul) | Tracking adjuntado |
| `delivered` | Delivered | success (verde) | Entrega verificada |
| `completed` | Completed | success (verde) | Ganancia realizada |
| `aborted` | Aborted | danger (rojo) | Piloto detenido por operador |
| `rollback` | Rollback requested/completed | warning (ámbar) | Control state rollback |

### Order Status Badges (componente: `OrderStatusBadge`)
| Status | Label | Tono |
|--------|-------|------|
| `CREATED` | Creado | gris |
| `PAID` | Por comprar | azul |
| `PURCHASING` | Comprando | ámbar + spinner |
| `PURCHASED` | Comprado | verde |
| `FAILED` | Fallido | rojo |
| `SIMULATED` | Simulado | violeta |
| `MANUAL_ACTION_REQUIRED` | Acción manual | naranja |
| `FULFILLMENT_BLOCKED` | Fulfillment bloqueado | rosa |

### Publishing Decision Badges (componente: `PublishingDecisionBadge`)
| Decision | Label | Tono |
|----------|-------|------|
| `PUBLICABLE` | Publicable ✓ | verde |
| `NO_PUBLICABLE` | No publicable | rojo |
| `NEEDS_MARKET_DATA` | Sin datos de mercado | amarillo |
| `NEEDS_ENRICHMENT` | Datos incompletos | naranja |
| `REJECTED_LOW_MARGIN` | Margen insuficiente | rojo |
| `REJECTED_NO_COMPETITOR_EVIDENCE` | Sin comparables reales | gris |

---

## Mapa de Superficies

### FLUJO PRINCIPAL (operativo crítico)

| Ruta | Superficie | Propósito operativo | Fuente de datos |
|------|-----------|---------------------|-----------------|
| `/dashboard` | Panel | Resumen ejecutivo: métricas, acciones, alertas. Tabs: Resumen, Tendencias, Búsqueda, Oportunidades IA, Sugerencias IA, Automatización | /api/dashboard/stats + /api/dashboard/inventory-summary + operationsTruth |
| `/control-center` | Control Center | Cockpit canónico: truth operativa, proof ladder, blockers, next actions, watch table, salud técnica, controles autopilot | /api/dashboard/operations-truth + /api/system/readiness-report + /api/autopilot/status |
| `/opportunities` | Oportunidades | Evaluación de oportunidades con publishing decision, pricing truth, margen, comparables | /api/opportunities/list + commercial truth |
| `/publisher` | Publicador inteligente | Publicación en ML/eBay/Amazon: pending approvals, pilot readiness, listings activos, capital disponible | /api/publisher/listings + preflight + pilot-ledger + working-capital |
| `/autopilot` | Autopilot | Gestión de workflows automáticos, estado de ciclos, fases | /api/autopilot/status + /api/workflows |

### CATÁLOGO Y VENTAS

| Ruta | Superficie | Propósito operativo |
|------|-----------|---------------------|
| `/products` | Productos | Catálogo con lifecycle badges, preflight, listings por marketplace |
| `/orders` | Órdenes | Post-venta: fulfillment, proof ladder, retry, manual purchase, eBay import |
| `/pending-purchases` | Compras pendientes | Cola de órdenes esperando compra al proveedor |
| `/sales` | Ventas | Historial de ventas, analytics financiero, proof de pago |
| `/products/:id/preview` | Detalle producto | Vista completa del producto con pipeline de publicación |
| `/orders/:id` | Detalle orden | Estado completo de una orden: símbolo tracking, proof |

### FINANZAS

| Ruta | Superficie | Propósito |
|------|-----------|-----------|
| `/finance` | Finanzas | Working capital, leverage, risk, proyección |
| `/commissions` | Comisiones | Comisiones por ventas, estado de pagos |

### CONFIGURACIÓN

| Ruta | Superficie | Propósito |
|------|-----------|-----------|
| `/api-settings` | API & Credenciales | Wizard OAuth ML, credenciales eBay/Amazon/AliExpress |
| `/workflow-config` | Workflows | Configuración de reglas de automatización |
| `/regional` | Regional | País, moneda, idioma |
| `/system-status` | Estado del sistema | Health técnico de servicios |
| `/help` | Ayuda | Documentación operativa |

---

## Runbook Pre-Compra Controlada

### Fase 1 — Preflight operativo (antes de publicar)
1. Ir a **Control Center** (`/control-center`)
   - Verificar que no hay blockers críticos en la tabla "Next Operator Actions"
   - Verificar "Technical Readiness Sub-layer": database OK, marketplace API OK, autopilot enabled/running
   - Revisar "Listing → Order → Fulfillment Watch": sin filas con estado "pending" en fulfillment que bloqueen

2. Ir a **Publicador** (`/publisher`)
   - Verificar que el producto tiene preflight `publishAllowed = true`
   - Confirmar `publishIntent = pilot` y que `pilotReadiness.pilotAllowed = true`
   - Confirmar capital disponible (BalanceSummary verde)
   - Confirmar listing activo en ML con estado `active` (badge verde)

### Fase 2 — Durante la compra de prueba
1. **Órdenes** (`/orders`): al recibir la orden debe aparecer con status `PAID` → `PURCHASING` → `PURCHASED`
2. **Control Center**: la tabla Watch debe mostrar `order_received` → `fulfillment_in_progress` → `shipped`
3. Si aparece `MANUAL_ACTION_REQUIRED`: ir a Orders, usar "Marcar como comprado manualmente"

### Fase 3 — Post-venta
1. **Control Center**: verificar que proof ladder avanza: orderIngested → supplierPurchaseProved → trackingAttached → deliveredTruthObtained → realizedProfitObtained
2. **Ventas** (`/sales`): verificar "Released funds proved" y "Realized profit proof"
3. **Órdenes** (`/orders`): verificar status `PURCHASED` y tracking number adjuntado

---

## GO / NO-GO Checklist Visual Pre-Compra Real

| Check | Dónde verificar | Criterio GO |
|-------|----------------|-------------|
| Backend conectado | `/dashboard` header badge | "Backend conectado" visible |
| Listing activo en ML | `/publisher` listings table | Badge `active` verde en columna Live State |
| Sin blockers críticos | `/control-center` Next Actions | Zero filas con blockerCode rojo |
| Capital disponible | `/publisher` BalanceSummary | `canPublish = true` |
| Pilot aprobado | `/publisher` listing row | `pilotAllowed = true` o badge "Pilot approved" |
| Preflight pasado | `/products` producto row | Badge "Ready local" o "Pilot approved" (verde) |
| Autopilot runtime OK | `/control-center` Technical Sub-layer | "Autopilot runtime: Ejecutándose" o config habilitada |
| Fulfillment path configurado | `/system-status` | AliExpress credentials presentes |

---

## Notas de Despliegue

- **Frontend**: Vercel (auto-deploy desde rama main). Build: `npm run build` → inject backend URL Railway → vite build.
- **Backend**: Railway (Root Directory = `backend`). Build: `npm ci && npm run build`. Start: `npm run start`. Health: `/health`.
- **Migrations**: Release Command en Railway → `node scripts/railway-migrate-deploy.js`.
- **API Base URL**: inyectada en build por `scripts/inject-vercel-backend.mjs` → apunta a `https://ivan-reseller-backend-production.up.railway.app`.
