# ML Chile Post-Sale and Tracking — Alignment
**Fecha:** 2026-04-04

---

## Estado Actual del Ciclo Post-Venta

### Pipeline de Fulfillment

```
ML Venta confirmada
  → Order sync (mercadolibre-order-sync.service.ts)
    → Sale en DB (status: PENDING)
      → Order creado (status: PAID)
        → fulfillOrder() triggered
          → Daily limits check
            → Freight truth check (resolveOrderTimeFreightTruth)
              → Profitability gate (checkOrderTimeProfitability)
                → AliExpress DS API purchase
                  → Order status: PURCHASED
                    → Tracking sync (pendiente / semimanual)
```

### Estado de Cada Componente

| Componente | Estado | Notas |
|---|---|---|
| Order sync ML → DB | ✅ Operativo | `mercadolibre-order-sync.service.ts` |
| Sale creation | ✅ Operativo | DB actualizado en sync |
| Order pipeline PAID→PURCHASED | ✅ Operativo | `order-fulfillment.service.ts` |
| Daily limits gate | ✅ Operativo | Configurable |
| Freight truth at order time | ✅ Operativo | Capa 1 real |
| Profitability gate at purchase | ✅ Operativo | Bloquea si pérdida |
| AliExpress DS API purchase | ✅ Operativo | Dropshipping API |
| Manual queue escalation | ✅ Operativo | `MANUAL_ACTION_REQUIRED` status |
| Tracking AliExpress → DB | ⚠️ Semimanual | DS API no garantiza tracking real-time |
| Tracking DB → ML webhook | ✅ Parcial | `mercadolibre-order-sync.service.ts` |
| Buyer notification (ML system) | ✅ Automático | ML lo hace internamente |

---

## Trazabilidad de Estado de Órdenes

### Estados del modelo `Order`

| Status | Significado | Acción del sistema |
|---|---|---|
| `CREATED` | Checkout iniciado | — |
| `PAID` | Pago confirmado en ML | Disparar `fulfillOrder()` |
| `PURCHASING` | En proceso de compra en AliExpress | Lock anti-duplicado |
| `PURCHASED` | AliExpress confirmó la compra | Continuar con tracking |
| `FAILED` | Error irrecuperable | Escalar a manual queue |
| `MANUAL_ACTION_REQUIRED` | Requiere intervención del operador | Visible en PendingPurchases UI |
| `FULFILLMENT_BLOCKED` | Bloqueado por gate (límites, profit) | Requiere revisión manual |
| `SIMULATED` | Entorno sandbox | Sin compra real |

### Por qué `MANUAL_ACTION_REQUIRED` es un estado de diseño correcto

Para el primer ciclo real de esta prueba controlada, la mayoría de órdenes pasarán por `MANUAL_ACTION_REQUIRED` si:
1. Falta la URL de AliExpress en el producto
2. El profitability gate bloquea (freight real > estimado)
3. La Daily limits están alcanzados

**Esto es intencional**: el sistema escala a manual en lugar de fallar silenciosamente. El operador ve la orden en `PendingPurchases` y puede reintentar o resolver manualmente.

---

## Tracking y Postventa

### Limitación conocida: Tracking no completamente automático

**Causa:** AliExpress Dropshipping API provee el `logistics_order_no` al confirmar la compra, pero el tracking number real (de courier) puede tardar 24-72h en estar disponible en AliExpress.

**Flujo actual:**
1. AliExpress DS API devuelve `aliexpressOrderId` al PURCHASED
2. El operador consulta AliExpress admin para obtener tracking cuando esté disponible
3. El tracking se puede ingresar manualmente en la orden y sincronizar a ML via API

**Flujo futuro (roadmap):**
- Cron job que consulta AliExpress DS API `/ds/order/get` para tracking updates
- Auto-sync tracking → ML via `POST /orders/{order_id}/shipments`

### Si alguien compra hoy — ¿qué pasa?

1. ML notifica al vendedor via webhook (`orders_v2` o polling)
2. `mercadolibre-order-sync.service.ts` crea la `Sale` y el `Order` en DB
3. Si `stageFulfillment = 'automatic'`: `fulfillOrder()` se ejecuta automáticamente
4. Si `stageFulfillment = 'manual'` o 'guided': Aparece en `PendingPurchases` UI
5. Si fulfillment falla (URL falta, profit gate): Status `MANUAL_ACTION_REQUIRED`
6. El operador interviene manualmente: ingresa URL AliExpress si faltaba, confirma compra
7. AliExpress recibe el pedido (dropship)
8. En 24-72h tracking disponible → operador lo marca en ML

**Duración estimada del ciclo completo (primer pedido real):** 3-5 días hasta PURCHASED + tracking

---

## Logs de Auditoría Post-Venta

### Qué se loguea actualmente

```
[ORDER-FULFILLMENT] fulfillOrder start          → orderId, status
[ORDER-FULFILLMENT] Daily limits check           → limitCheck result
[ORDER-FULFILLMENT] Resolved productUrl          → source (product/listing)
[ORDER-FULFILLMENT] Order-time freight truth     → freightCost, country
[ORDER-FULFILLMENT] Profitability gate           → saleUsd, costUsd, profitUsd, ok/blocked
[ORDER-FULFILLMENT] AliExpress DS purchase       → aliexpressOrderId, status
[ORDER-FULFILLMENT] Order PURCHASED              → final status
[ML-CHILE-COMPLIANCE] Business truth at publish  → NEW: shipping/tax/legal truth
```

### PurchaseLog model

Cada intento de compra AliExpress queda en `PurchaseLog` con:
- `orderId`, `aliexpressOrderId`, `status`, `errorMessage`
- `createdAt` para timeline de auditoría

---

## Señales de Alerta para Intervención Manual

El sistema expone estas señales al operador via `GET /api/workflow/ml-chile-truth/:productId`:

```json
{
  "truth": {
    "fulfillmentReadiness": {
      "aliexpressUrlPresent": false,          // BLOQUEANTE
      "profitabilityGateOk": false,           // BLOQUEANTE
      "manualInterventionRequired": true,
      "notes": [
        "FALTA URL AliExpress — compra automática bloqueada.",
        "SHIPPING_TRUTH_NOT_ENFORCED_ON_ML: Listing opera en not_specified."
      ]
    },
    "overallReadiness": "not_ready"
  }
}
```

**El operador puede responder:**
- `aliexpressUrlPresent: false` → Editar el producto y añadir la URL
- `profitabilityGateOk: false` → Revisar pricing o el costo real del flete
- Shipping warnings → Documentados, no bloquean el fulfillment

---

## Riesgos Operativos Remanentes

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Tracking no disponible en 48h | Media | Operador monitorea AliExpress admin |
| Freight real > estimado (pérdida) | Baja | Gate de profitabilidad en fulfillment |
| URL AliExpress incorrecta | Baja | Validación regex en fulfillment service |
| ML cancela orden antes de comprar | Baja | Webhook sync actualiza estado |
| AliExpress producto sin stock | Baja | supplierStock sync periódico |
| Proveedor cambia precio post-publicación | Media | Freight truth check at order time |
