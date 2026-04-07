# ML Chile Frontend — Operational Alignment
**Fecha:** 2026-04-04

---

## Estado Actual del Frontend

### Páginas relevantes para dropshipping ML Chile

| Página | Estado | Valor operativo |
|---|---|---|
| `WorkflowConfig.tsx` | ✅ Operativo | Config de handling time, ambiente, stages |
| `ProductPreview.tsx` | ✅ Operativo | Vista de producto + publicación manual |
| `Products.tsx` | ✅ Operativo | Inventario de productos |
| `Orders.tsx` | ✅ Operativo | Pipeline de órdenes |
| `PendingPurchases.tsx` | ✅ Operativo | Cola de compras manuales |
| `Sales.tsx` | ✅ Operativo | Historial de ventas |
| `SystemLogs.tsx` | ✅ Operativo | Logs del sistema |
| `Diagnostics.tsx` | ✅ Operativo | Diagnóstico de conectividad |

### Inconsistencias identificadas (pre-implementación)

1. **No había vista de "shipping truth"** por producto → Ya disponible via nuevo endpoint
2. **No había "compliance status"** del listing → Ya disponible via nuevo endpoint
3. **`mlHandlingTimeDays` configurable** pero sin feedback de qué ETA genera → Pendiente de UI enhancement
4. **Sin "what happens if someone buys today"** resumen → Disponible via `/ml-chile-checklist/:productId`

---

## Nuevos Endpoints Disponibles para el Frontend

### `GET /api/workflow/ml-chile-truth/:productId`

Retorna el truth model completo. El frontend puede usarlo para mostrar:

```
✅ Origen: China (AliExpress dropshipping)
✅ ETA: 20-40 días (base: default)
⚠️  Shipping: me2_attempted_not_enforced — ETA en descripción compensa
✅ IVA: 19% gestionado por Mercado Libre
✅ Textos legales: appended
⚡ Readiness: PARTIAL
```

**Recomendación de implementación:** Añadir un componente `<MLChileTruthBadge />` en `ProductPreview.tsx` que consume este endpoint y muestra un resumen visual.

### `GET /api/workflow/ml-chile-checklist/:productId`

Retorna checklist estructurado:

```json
{
  "checklist": [
    { "item": "AliExpress URL presente", "ok": true, "critical": true },
    { "item": "Precio > Costo total", "ok": true, "critical": true },
    { "item": "Textos legales en descripción", "ok": true, "critical": false },
    { "item": "Garantía legal (6 meses) declarada", "ok": true, "critical": false },
    ...
  ],
  "overallReadiness": "ready"
}
```

**Recomendación de implementación:** Usar en un modal "Verificar antes de publicar" o en un panel lateral en `ProductPreview.tsx`.

---

## Configuración Frontend ya Disponible

### WorkflowConfig.tsx

El campo `mlHandlingTimeDays` ya está en la UI de configuración. El operador puede:
- Ajustar cuántos días se declaran como handling time en ML
- Esto afecta directamente el ETA en el footer de la descripción

**Flujo de valor:**
```
Operador cambia mlHandlingTimeDays a 25
  → WorkflowConfig PUT /api/workflow/config
    → Próxima publicación usa 25 días
      → Footer: "Tiempo estimado: 17-30 días hábiles"
```

---

## Preguntas Operativas — Respuestas del Sistema

### ¿Este listing está realmente listo?
**Endpoint:** `GET /api/workflow/ml-chile-checklist/:productId`  
**Campo:** `overallReadiness` → `'ready' | 'partial' | 'not_ready'`

### ¿Qué shipping truth tiene?
**Endpoint:** `GET /api/workflow/ml-chile-truth/:productId`  
**Campo:** `truth.shippingTruth.status` + `truth.shippingTruth.knownLimitation`

### ¿Qué ETA promete?
**Endpoint:** `GET /api/workflow/ml-chile-truth/:productId`  
**Campo:** `truth.eta.label` + `truth.eta.basis`

### ¿Qué parte es estimada vs confirmada?
**Endpoint:** `GET /api/workflow/ml-chile-truth/:productId`  
**Campo:** `truth.eta.basis` → `'configured' | 'product_data' | 'default'`

### ¿Si alguien compra hoy, qué pasa?
**Endpoint:** `GET /api/workflow/ml-chile-truth/:productId`  
**Campo:** `truth.fulfillmentReadiness` → `aliexpressUrlPresent`, `profitabilityGateOk`, `manualInterventionRequired`, `notes`

### ¿Qué falta para operar sin intervención?
**Endpoint:** `GET /api/workflow/ml-chile-checklist/:productId`  
**Campo:** `checklist` filtrado por `ok: false` → lista de pendientes

---

## Pendientes de Implementación UI (Próxima Fase)

### Alta prioridad

1. **`<MLChileTruthPanel />`** en `ProductPreview.tsx`  
   - Consume `/ml-chile-truth/:productId`
   - Muestra shipping truth, ETA, compliance status, readiness
   - Permite al operador saber de un vistazo si el listing está operativo

2. **`<MLChileChecklist />`** (modal o sidebar)  
   - Consume `/ml-chile-checklist/:productId`
   - Checklist visual con ✅/❌ por item
   - Botón "Republicar para corregir textos legales" si `legalTextsAppended: false`

### Media prioridad

3. **Badge de `shippingTruthStatus`** en la lista de productos/listings  
   - `me2_enforced` → badge verde
   - `me2_attempted_not_enforced` → badge amarillo
   - `not_specified` → badge naranja
   - `unknown` → badge gris

4. **Indicador de `overallReadiness`** en `Products.tsx`  
   - Columna adicional en la tabla de productos mostrando readiness

### Baja prioridad

5. **Panel de `operatorSummary`** en `SystemLogs.tsx`  
   - Filtro para ver solo logs de ML Chile compliance

---

## Estado de Consistencia Frontend ↔ Backend

| Aspecto | Estado |
|---|---|
| WorkflowConfig ↔ backend config service | ✅ Consistente |
| Orders ↔ order-fulfillment status | ✅ Consistente |
| PendingPurchases ↔ MANUAL_ACTION_REQUIRED | ✅ Consistente |
| ML Chile truth ↔ nuevo endpoint | ✅ Endpoint disponible; UI pendiente |
| Shipping truth status ↔ DB field | ✅ En DB; sin UI aún |
| Legal compliance ↔ DB field | ✅ En DB; sin UI aún |
| Checklist ↔ nuevo endpoint | ✅ Endpoint disponible; UI pendiente |

**Conclusión:** El backend y los datos están correctos. El frontend tiene acceso a toda la información via los nuevos endpoints. La prioridad de la siguiente fase es consumir esos endpoints en la UI para cerrar la brecha de visibilidad operativa.
