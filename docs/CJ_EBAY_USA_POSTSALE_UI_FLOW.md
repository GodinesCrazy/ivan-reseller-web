# CJ → eBay USA — Flujo UI Postventa

**Versión:** 2.0  
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
| `/cj-ebay/orders` | `CjEbayOrdersPage` | **Panel de gestión postventa CJ** |
| `/cj-ebay/orders/:orderId` | `CjEbayOrderDetailPage` | **Consola de detalle de una orden CJ** |
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
  Ordenar en CJ          POST /api/cj-ebay/orders/:id/place                  │
  (createOrderV2         → CJ_ORDER_CREATED                                   │
   payType=3)                                                                  │
        │                                                                      │
        ▼  (si AUTO_CONFIRM_PAY: automático)                                  │
  Confirmar              POST /api/cj-ebay/orders/:id/confirm                │
  (confirmOrder)         → CJ_ORDER_CONFIRMING → CJ_PAYMENT_PENDING          │
        │                                                                      │
        ▼  (si AUTO_CONFIRM_PAY: automático)                                  │
  Pagar balance          POST /api/cj-ebay/orders/:id/pay                    │
  (payBalance)           → CJ_PAYMENT_COMPLETED → CJ_FULFILLING              │
        │                                                                      │
        ▼                                                                      │
  CJ fulfills/ships      CJ fulfillment pipeline                              │
                         → CJ_SHIPPED                                         │
        │                                                                      │
        ▼                                                                      │
  Sincronizar tracking   POST /api/cj-ebay/orders/:id/sync-tracking          │
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

### Principios de diseño

- **Sin texto de desarrollo** — ningún mensaje tipo "listo en código", nombres de métodos ni parámetros internos.
- **Orientada a operación** — muestra estado real, próximo paso y acciones disponibles.
- **Estado vacío informativo** — "Esperando primera orden real" cuando no hay órdenes.

### Estructura de la pantalla

| Elemento | Descripción |
|---|---|
| **Callout operador** | Guía rápida del ciclo; sin link a legacy `/orders` |
| **Header** | Título profesional + subtítulo operativo |
| **KPIs (4 tarjetas)** | Total órdenes · En progreso · Requieren atención · Completadas — siempre visibles, incluso con 0 órdenes |
| **Importar orden** | Input ID eBay + botón Importar; Enter también importa |
| **Filtros** | Estado (dropdown) · Requieren atención (toggle) · Búsqueda libre (eBay ID / CJ ID / SKU) · Limpiar filtros |
| **Tabla de órdenes** | Columnas: eBay order · Estado · Próximo paso · CJ order · SKU · Total USD · Actualizado · Acciones |
| **Acciones de fila** | Contextuales según estado: Ver detalle · Ordenar en CJ · Confirmar · Pagar · Actualizar estado · Tracking |

### Etiquetas de estado (human-readable)

| Clave interna | Etiqueta visible |
|---|---|
| DETECTED | Detectada |
| VALIDATED | Validada |
| CJ_ORDER_CREATED | Orden CJ creada |
| CJ_ORDER_CONFIRMING | Confirmando |
| CJ_PAYMENT_PENDING | Pago pendiente |
| CJ_PAYMENT_PROCESSING | Procesando pago |
| CJ_PAYMENT_COMPLETED | Pago completado |
| CJ_FULFILLING | En fulfillment |
| CJ_SHIPPED | Enviada por CJ |
| TRACKING_ON_EBAY | Tracking en eBay |
| COMPLETED | Completada |
| FAILED | Fallida |
| NEEDS_MANUAL | Intervención manual |

### Columna "Próximo paso"

| Estado | Texto mostrado |
|---|---|
| DETECTED | Pendiente de validación |
| VALIDATED | Ordenar en CJ |
| CJ_ORDER_CREATED | Confirmar con CJ |
| CJ_ORDER_CONFIRMING | Esperando confirmación |
| CJ_PAYMENT_PENDING | Pagar balance CJ |
| CJ_PAYMENT_PROCESSING | Procesando pago |
| CJ_PAYMENT_COMPLETED | Esperando fulfillment |
| CJ_FULFILLING | CJ preparando envío |
| CJ_SHIPPED | Sincronizar tracking |
| TRACKING_ON_EBAY | Tracking subido a eBay |
| COMPLETED | — |
| FAILED | Revisar error |
| NEEDS_MANUAL | Intervención requerida |

### Lógica de acciones por estado

| Estado | Ordenar en CJ | Confirmar | Pagar | Actualizar estado | Tracking |
|---|---|---|---|---|---|
| VALIDATED | ✅ | — | — | — | — |
| CJ_ORDER_CREATED | — | ✅ | — | ✅ | ✅ |
| CJ_PAYMENT_PENDING | — | — | ✅ | ✅ | ✅ |
| CJ_FULFILLING / CJ_SHIPPED | — | — | — | ✅ | ✅ |
| FAILED / NEEDS_MANUAL (con listingId) | ✅ | — | — | ✅ | ✅ |
| COMPLETED | — | — | — | — | — |

Las acciones se muestran solo cuando aplican al estado actual (condicional, no deshabilitadas con opacidad excepto por `busyOrderId`).

---

## 5. Pantalla: CjEbayOrderDetailPage (`/cj-ebay/orders/:orderId`)

### Estructura de la pantalla

| Sección | Fuente de datos |
|---|---|
| Header (eBay order ID, estado, refresh) | Estado local |
| Datos de la orden | `GET /api/cj-ebay/orders/:orderId` |
| Acciones del ciclo + próxima acción sugerida | `GET /api/cj-ebay/orders/:orderId` + `/operational-flow` |
| Tracking (si existe) | `GET /api/cj-ebay/orders/:orderId` (campo `tracking`) |
| Historial de eventos | `GET /api/cj-ebay/orders/:orderId` (campo `events`) |
| Estado del flujo (gates + trazas recientes) | `GET /api/cj-ebay/orders/:orderId/operational-flow` |
| Auditoría — evidencia resumida (colapsable) | `GET /api/cj-ebay/orders/:orderId/evidence-summary` |
| Datos raw eBay (colapsable — avanzado) | `GET /api/cj-ebay/orders/:orderId` (campo `rawEbaySummary`) |

### Acciones operativas (labels visibles)

| Acción visible | Endpoint | Estado requerido |
|---|---|---|
| Ordenar en CJ | POST `/place` | VALIDATED o FAILED/NEEDS_MANUAL con listingId |
| Confirmar orden | POST `/confirm` | CJ_ORDER_CREATED + cjOrderId |
| Pagar balance | POST `/pay` | CJ_PAYMENT_PENDING + cjOrderId |
| Actualizar estado | GET `/status` | Cualquiera con cjOrderId, excepto COMPLETED |
| Sincronizar tracking | POST `/sync-tracking` | Cualquiera con cjOrderId, excepto COMPLETED |

### Próxima acción sugerida

El panel de acciones muestra un banner de "Próxima acción" cuando el servicio `operational-flow` devuelve `suggestedNext`. Es el primer elemento visible en el panel, antes de los botones.

### Comportamiento de acciones

- Cada acción tiene un spinner individual.
- Tras cada acción, la pantalla se recarga automáticamente.
- Los banners de confirmación/error son propios del módulo CJ (no toasts legacy).
- El contenido raw y de auditoría está en secciones colapsables (`<details>`).

---

## 6. Endpoints consumidos (mapa completo)

```
GET  /api/cj-ebay/orders                           → Lista de órdenes
POST /api/cj-ebay/orders/import                    → Importar por ebayOrderId
GET  /api/cj-ebay/orders/:orderId                  → Detalle completo
GET  /api/cj-ebay/orders/:orderId/status           → Sync estado desde CJ API
GET  /api/cj-ebay/orders/:orderId/operational-flow → Gates del flujo + next step + trazas
GET  /api/cj-ebay/orders/:orderId/evidence-summary → Audit trail
POST /api/cj-ebay/orders/:orderId/place            → Ordenar en CJ
POST /api/cj-ebay/orders/:orderId/confirm          → Confirmar en CJ
POST /api/cj-ebay/orders/:orderId/pay              → Pagar balance CJ
POST /api/cj-ebay/orders/:orderId/sync-tracking    → Sincronizar tracking desde CJ
```

**Cero dependencia de `/api/orders` (legacy).**

---

## 7. Estados del ciclo (CjEbayOrder.status)

| Estado | Descripción operativa |
|---|---|
| `DETECTED` | Orden eBay detectada, pendiente de validación de listing |
| `VALIDATED` | Validada y lista para ordenar en CJ |
| `CJ_ORDER_CREATED` | Orden creada en CJ, pendiente de confirmación |
| `CJ_ORDER_CONFIRMING` | En proceso de confirmación con CJ |
| `CJ_PAYMENT_PENDING` | Confirmada, pendiente de pago |
| `CJ_PAYMENT_PROCESSING` | Pago en proceso |
| `CJ_PAYMENT_COMPLETED` | Pagada, CJ procesando fulfillment |
| `CJ_FULFILLING` | CJ preparando el envío |
| `CJ_SHIPPED` | Enviada por CJ — sincronizar tracking |
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

## 9. Principios UX adoptados (v2.0)

1. **Sin texto de desarrollo en el frontend principal.** Frases como "listo en código", nombres de métodos API (`createOrderV2`, `payBalance`, `confirmOrder`) o parámetros internos (`cjPostCreateCheckoutMode`) no aparecen en ninguna parte del flujo operativo principal.

2. **Badges con etiquetas humanas.** Los estados del ciclo muestran texto legible para el operador, no claves de enum crudas.

3. **Columna "Próximo paso" siempre presente.** El operador puede entender de un vistazo qué corresponde hacer en cada orden sin necesidad de abrir el detalle.

4. **KPIs siempre visibles.** El estado general del módulo es visible incluso cuando no hay órdenes (estado vacío informativo).

5. **Filtros operativos.** Por estado, por "requieren atención" (FAILED + NEEDS_MANUAL + DETECTED) y búsqueda libre por ID eBay / ID CJ / SKU.

6. **Acciones contextuales.** En la tabla, solo se muestran los botones aplicables al estado de cada fila. En el detalle, los botones aparecen para todas las etapas pero se deshabilitan cuando no corresponden.

7. **Próxima acción sugerida prominente.** En el detalle, el `suggestedNext` del servicio `operational-flow` aparece como un banner destacado antes de los botones de acción.

8. **Raw / avanzado en colapsables.** Los datos crudos de eBay y la evidencia de auditoría están en secciones `<details>` fuera del flujo principal.

---

## 10. Validación de aislamiento (checklist)

- [x] `/cj-ebay/orders` es ruta propia del módulo (no `/orders`)
- [x] Datos de `/api/cj-ebay/orders` (no `/api/orders`)
- [x] `/cj-ebay/orders/:orderId` consola detallada de la orden CJ
- [x] Callout de operador no enlaza a `/orders` legacy
- [x] Todas las acciones usan endpoints `/api/cj-ebay/orders/...`
- [x] La pantalla legacy `/orders` no se ve afectada
- [x] El pipeline search → evaluate → draft → listings no se rompe
- [x] Sin texto de desarrollo en el frontend principal
- [x] Badges muestran etiquetas operativas, no enum crudos
- [ ] Primera orden real con cuenta CJ activa (pendiente de validación viva)

---

*Documento v2.0 — 2026-04-15. Rediseño Orders: panel profesional de gestión postventa.*
