# CJ → eBay USA — Flujo UI Postventa

**Versión:** 1.0  
**Fecha:** 2026-04-15  
**Módulo:** CJ → eBay USA (vertical aislada)

---

## 1. Principio de aislamiento

La postventa CJ → eBay USA está **completamente encapsulada** dentro del módulo:

- El operador **nunca necesita salir del módulo** CJ para gestionar órdenes CJ.
- Los datos de órdenes CJ **no mezclan** tablas, APIs ni vistas con el sistema legacy de `Order` / `/orders`.
- Todas las llamadas de API van bajo `/api/cj-ebay/orders/...`.
- La navegación legacy `/orders` sigue operativa para sus propios flujos (AliExpress, ML, Amazon) y **no recibe** órdenes CJ.

---

## 2. Rutas del módulo

| Ruta frontend | Componente | Descripción |
|---|---|---|
| `/cj-ebay/overview` | `CjEbayOverviewPage` | Dashboard agregado del módulo |
| `/cj-ebay/products` | `CjEbayProductsPage` | Búsqueda CJ, selección variante, evaluate, draft |
| `/cj-ebay/listings` | `CjEbayListingsPage` | Listings creados y su estado eBay |
| `/cj-ebay/orders` | `CjEbayOrdersPage` | **Listado de órdenes postventa CJ** |
| `/cj-ebay/orders/:orderId` | `CjEbayOrderDetailPage` | **Detalle completo de una orden CJ** |
| `/cj-ebay/alerts` | `CjEbayAlertsPage` | Alertas del módulo |
| `/cj-ebay/profit` | `CjEbayProfitPage` | Snapshots de profit |
| `/cj-ebay/logs` | `CjEbayLogsPage` | Trazas de ejecución |

El módulo está envuelto en `CjEbayModuleGate` (feature flag `VITE_ENABLE_CJ_EBAY_MODULE`) y `CjEbayLayout` (tab nav horizontal).

---

## 3. Ciclo postventa completo

```
eBay vende el listing CJ
        │
        ▼
[ /cj-ebay/orders ] ──── Importar orden eBay por ID ─────────────────────────┐
        │                POST /api/cj-ebay/orders/import                      │
        │                { ebayOrderId }                                       │
        │                                                                      │
        ▼                                                                      │
   DETECTED / VALIDATED                                                        │
        │                                                                      │
        ▼                                                                      │
  Place CJ order         POST /api/cj-ebay/orders/:id/place                  │
  (createOrderV2         → CJ_ORDER_CREATED                                   │
   payType=3)                                                                  │
        │                                                                      │
        ▼  (si AUTO_CONFIRM_PAY: automático)                                  │
  Confirm CJ             POST /api/cj-ebay/orders/:id/confirm                │
  (confirmOrder)         → CJ_ORDER_CONFIRMING → CJ_PAYMENT_PENDING          │
        │                                                                      │
        ▼  (si AUTO_CONFIRM_PAY: automático)                                  │
  Pay CJ balance         POST /api/cj-ebay/orders/:id/pay                    │
  (payBalance)           → CJ_PAYMENT_COMPLETED → CJ_FULFILLING              │
        │                                                                      │
        ▼                                                                      │
  CJ fulfills/ships      CJ fulfillment pipeline                              │
                         → CJ_SHIPPED                                         │
        │                                                                      │
        ▼                                                                      │
  Sync tracking          POST /api/cj-ebay/orders/:id/sync-tracking          │
                         → TRACKING_ON_EBAY                                   │
        │                                                                      │
        ▼                                                                      │
   COMPLETED             Order lifecycle complete                              │
                                                                               │
  ──────────────── Error en cualquier paso ──────────────────────────────────┘
  FAILED / NEEDS_MANUAL  → Revisar lastError, eventos, flujo operacional
                           Reintentar acción desde detalle o tabla
```

---

## 4. Pantalla: CjEbayOrdersPage (`/cj-ebay/orders`)

### Elementos

| Elemento | Descripción |
|---|---|
| **Callout operador** | Guía rápida del ciclo; sin link a legacy `/orders` |
| **Readiness banner** | Estado de cada paso del ciclo (listo en código / pendiente real) |
| **KPI strip** | Total · En progreso · Fallo/manual |
| **Importar orden** | Input ebayOrderId + botón Importar |
| **Tabla de órdenes** | eBay order · Estado (badge color) · CJ order · SKU · Total USD · Actualizado · Acciones |
| **Acciones de fila** | Detalle (→ detail page) · Place CJ · CJ status · Tracking · Confirmar · Pagar |

### Lógica de botones activos por estado

| Estado | Place CJ | Confirmar | Pagar | CJ status | Tracking |
|---|---|---|---|---|---|
| VALIDATED | ✅ | — | — | — | — |
| CJ_ORDER_CREATED | — | ✅ | — | ✅ | ✅ |
| CJ_PAYMENT_PENDING | — | — | ✅ | ✅ | ✅ |
| CJ_FULFILLING / CJ_SHIPPED | — | — | — | ✅ | ✅ |
| FAILED / NEEDS_MANUAL | ✅ (si listingId) | — | — | ✅ | ✅ |
| COMPLETED | — | — | — | — | — |

---

## 5. Pantalla: CjEbayOrderDetailPage (`/cj-ebay/orders/:orderId`)

### Secciones

| Sección | Fuente de datos |
|---|---|
| Header (eBay order ID, estado, refresh) | Estado local |
| Datos de la orden (mapping eBay ↔ CJ completo) | `GET /api/cj-ebay/orders/:orderId` |
| Acciones del ciclo (5 botones contextuales) | Mismo endpoint; acciones a sus respectivos POST/GET |
| Tracking | `GET /api/cj-ebay/orders/:orderId` (campo `tracking`) |
| Timeline de eventos | `GET /api/cj-ebay/orders/:orderId` (campo `events`) |
| Flujo operacional (gates + suggestedNext + trazas) | `GET /api/cj-ebay/orders/:orderId/operational-flow` |
| Evidencia resumida (audit trail, colapsable) | `GET /api/cj-ebay/orders/:orderId/evidence-summary` |
| Raw eBay summary (colapsable) | `GET /api/cj-ebay/orders/:orderId` (campo `rawEbaySummary`) |

### Comportamiento de acciones

- Cada acción tiene un spinner individual (no bloquea toda la pantalla).
- Tras cada acción, el detalle se recarga automáticamente.
- Los banners de confirmación/error son propios del módulo CJ (no toasts legacy).
- Las acciones respetan la lógica de estado: solo se habilitan cuando el estado actual las permite.

---

## 6. Endpoints consumidos (mapa completo)

```
GET  /api/cj-ebay/orders                           → Lista paginada de órdenes
POST /api/cj-ebay/orders/import                    → Importar por ebayOrderId
GET  /api/cj-ebay/orders/:orderId                  → Detalle completo
GET  /api/cj-ebay/orders/:orderId/status           → Sync estado desde CJ API
GET  /api/cj-ebay/orders/:orderId/operational-flow → Gates del flujo + next step + trazas
GET  /api/cj-ebay/orders/:orderId/evidence-summary → Audit trail
POST /api/cj-ebay/orders/:orderId/place            → Place order en CJ
POST /api/cj-ebay/orders/:orderId/confirm          → Confirm en CJ
POST /api/cj-ebay/orders/:orderId/pay              → Pay balance CJ
POST /api/cj-ebay/orders/:orderId/sync-tracking    → Sync tracking desde CJ
```

**Cero dependencia de `/api/orders` (legacy).**

---

## 7. Estados del ciclo (CjEbayOrder.status)

| Estado | Descripción |
|---|---|
| `DETECTED` | Orden eBay detectada, pendiente de validación |
| `VALIDATED` | Validada y lista para place en CJ |
| `CJ_ORDER_CREATED` | Orden creada en CJ, pendiente de confirm |
| `CJ_ORDER_CONFIRMING` | En proceso de confirmación |
| `CJ_PAYMENT_PENDING` | Confirmada, pendiente de pago |
| `CJ_PAYMENT_PROCESSING` | Pago en proceso |
| `CJ_PAYMENT_COMPLETED` | Pagada, CJ procesando fulfillment |
| `CJ_FULFILLING` | CJ está preparando el envío |
| `CJ_SHIPPED` | Enviada por CJ |
| `TRACKING_ON_EBAY` | Tracking subido a eBay |
| `COMPLETED` | Ciclo completo |
| `FAILED` | Error — revisar lastError y eventos |
| `NEEDS_MANUAL` | Requiere intervención manual del operador |

---

## 8. Separación con legacy `/orders`

| Aspecto | CJ → eBay USA (este módulo) | Legacy `/orders` |
|---|---|---|
| Tabla DB | `cj_ebay_order` | `Order` |
| API prefix | `/api/cj-ebay/orders/...` | `/api/orders/...` |
| Ruta frontend | `/cj-ebay/orders` y `/cj-ebay/orders/:id` | `/orders` y `/orders/:id` |
| Proveedor | CJ Dropshipping | AliExpress / ML / Amazon / PayPal |
| Flujo | Import manual → CJ place/confirm/pay | Webhook / sync marketplace → compra AliExpress |
| UI dependencia cruzada | Ninguna | Ninguna |

---

## 9. Validación de aislamiento (checklist)

- [x] Menú CJ → eBay USA → Órdenes abre `/cj-ebay/orders` (no `/orders`)
- [x] `/cj-ebay/orders` carga datos de `/api/cj-ebay/orders` (no `/api/orders`)
- [x] `/cj-ebay/orders/:orderId` abre el detalle completo del módulo CJ
- [x] El callout de operador no enlaza a `/orders` legacy
- [x] Todas las acciones usan endpoints `/api/cj-ebay/orders/...`
- [x] La pantalla legacy `/orders` no se ve afectada
- [x] El pipeline search → evaluate → draft → listings no se rompe
- [ ] Primera orden real con cuenta CJ activa (pendiente de validación viva)

---

*Documento creado: 2026-04-15*
