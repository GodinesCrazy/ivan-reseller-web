# Primera Orden Real Controlada — Protocolo de Preparación
**Fecha:** 2026-04-04  
**Fase:** Post-Republish / Pre-Primera Venta  
**Estado de seguridad:** stageFulfillment=manual, stagePurchase=manual ✅

---

## Resumen Ejecutivo

Este documento define el protocolo completo para la primera orden real en Mercado Libre Chile.  
El sistema está en modo **SEGURO**: ninguna compra se ejecuta automáticamente.  
El operador debe confirmar manualmente cada paso.

---

## Pre-Condiciones (Verificar Antes de Activar el Listing)

### Críticas (bloquean la operación)

- [ ] Listing republicado con footer legal (`legalTextsAppended = true`)
- [ ] Precio correcto en ML: ~9,000-10,000 CLP (NO 6.01 CLP)
- [ ] `overallReadiness: "ready"` o `"partial"` (via `/api/workflow/ml-chile-checklist/32722`)
- [ ] URL AliExpress válida en producto 32722 ✅ (ya confirmado)
- [ ] `stageFulfillment = manual` en WorkflowConfig ✅ (ya aplicado)
- [ ] Código con footer legal desplegado en Railway ✅

### Recomendadas (no bloquean pero son importantes)

- [ ] Listing en status `active` en ML (no `under_review`, `paused`, `forbidden`)
- [ ] Verificación visual: abrir la URL del listing y confirmar precio + footer en descripción
- [ ] Verificar que el listing tiene imágenes visibles y correctas
- [ ] Confirmar saldo en cuenta ML ≥ $0 (para recibir pagos)

---

## WorkflowConfig — Configuración para Primera Orden

**Estado actual (confirmado en DB):**

```
workflowMode:       hybrid     ← Correcto para prueba controlada
stageFulfillment:   manual     ← CRÍTICO: operador confirma antes de comprar en AliExpress
stagePurchase:      manual     ← CRÍTICO: operador confirma cada paso
environment:        production ← Correcto
mlHandlingTimeDays: 30         ← ETA declarado en descripción
```

**NO cambiar estos valores hasta completar la primera orden exitosamente.**

---

## Flujo de la Primera Orden — Paso a Paso

### Fase 1: Venta en ML (Automático)

```
Comprador en ML Chile
  → Hace click en "Comprar"
  → Paga con ML Pay
  → ML notifica webhook a Ivan Reseller Web
  → Order creada en DB con status = CREATED
  → Order sync: status = PAID
```

**Acción del operador:** Ninguna. Monitorear que la orden aparezca en `/orders` de la app.

---

### Fase 2: Validación Pre-Compra (Automático con Gates)

```
Sistema verifica:
  ✅ Daily purchase limit no excedido
  ✅ Profitability gate: salePrice > totalCost
  ✅ AliExpress URL presente
  ✅ Dirección de envío parseada correctamente
  ✅ Freight truth: costo de envío estimado a Chile
```

Si todos los gates pasan → Order queda en status `PURCHASING` (esperando confirmación manual).  
Si algún gate falla → Order escala a `MANUAL_ACTION_REQUIRED`.

---

### Fase 3: Confirmación Manual del Operador (REQUERIDA)

**Cuando `stageFulfillment = manual`**, el sistema NO procede automáticamente.

**Acción del operador:**

1. Verificar en la app: Orders → encontrar la orden en status `PURCHASING` o `MANUAL_ACTION_REQUIRED`
2. Revisar:
   - Precio de venta en CLP (confirmar que es ~9,000-10,000 CLP)
   - Dirección de envío del comprador (parseable y válida)
   - Freight truth: costo de envío estimado (debe ser ~$1.99-4.99 USD)
   - Profitabilidad: debe ser positiva
3. Si todo está OK: confirmar la compra manualmente
4. Si hay problema: escalar a `MANUAL_ACTION_REQUIRED` y resolver

---

### Fase 4: Compra en AliExpress (Semiautomático)

```
Operador confirma → Sistema intenta compra en AliExpress
  → aliexpressOrderId guardado en DB
  → Order status = PURCHASED
```

**Nota:** Para la primera prueba, verificar personalmente en AliExpress admin que la orden se creó.

---

### Fase 5: Tracking (Semimanual — Limitación L3)

```
AliExpress procesa el pedido (24-72h)
  → Genera número de tracking
  → Envía notificación al email de la cuenta AliExpress
```

**Acción del operador (24-72h post-compra):**

1. Ingresar a cuenta AliExpress
2. Ir a "Mis Pedidos" → encontrar el pedido
3. Copiar el número de tracking (formato: LPXXXXXXXXXX o similar)
4. En ML Chile: ir al pedido → "Agregar tracking"
5. Ingresar el número de tracking

**Este paso es semimanual hasta que se implemente el tracking sync automático.**

---

## Escalaciones Esperadas

### `MANUAL_ACTION_REQUIRED` — Causas Comunes

| Causa | Qué revisar | Acción |
|---|---|---|
| Profitabilidad negativa | Freight muy alto | Ajustar precio o cambiar proveedor |
| URL AliExpress inválida | El producto cambió de URL | Actualizar URL en producto 32722 |
| Dirección no parseable | Dirección extraña del comprador | Ingresar manualmente en AliExpress |
| Límite diario excedido | Daily limits config | Ajustar daily limits en WorkflowConfig |
| AliExpress sin stock | Proveedor sin inventario | Buscar proveedor alternativo |

---

## Criterios de Éxito — Primera Orden

La primera orden se considera **exitosa** si:

- [ ] Orden PAID recibida y sincronizada en DB
- [ ] Profitability gate: positivo (salePrice > totalCost)
- [ ] Compra en AliExpress ejecutada (`aliexpressOrderId` presente en DB)
- [ ] Tracking ingresado en ML dentro de 72h
- [ ] Comprador recibe el producto (estimado 20-40 días hábiles)
- [ ] Sin quejas/reclamos del comprador

**Criterio de fracaso controlado (no catastrófico):**

- Orden en `MANUAL_ACTION_REQUIRED` → sistema escala correctamente, sin pérdida automática
- AliExpress rechaza la compra → operador puede intentar compra manual directamente en AliExpress
- Comprador abre disputa → gestionar via ML Centro de Resoluciones con garantía 6 meses declarada

---

## Parámetros de Riesgo — Primera Orden

| Parámetro | Valor | Justificación |
|---|---|---|
| Precio de venta | ~9,990 CLP (~$10 USD) | Bajo — minimiza riesgo |
| Costo máximo asumido | ~$4.39 USD | Bajo riesgo financiero |
| Pérdida máxima posible | ~$4.39 USD (si falla todo) | Aceptable para prueba |
| stageFulfillment | manual | Operador controla cada compra |
| Modo de operación | hybrid | Flexibilidad máxima |

---

## Comandos de Monitoreo

Durante la primera orden, usar estos endpoints para monitorear el estado:

```bash
# Estado de todas las órdenes
GET /api/orders

# Estado específico de una orden
GET /api/orders/:orderId

# Truth model del producto
GET /api/workflow/ml-chile-truth/32722

# Checklist de readiness
GET /api/workflow/ml-chile-checklist/32722

# Logs del sistema
GET /api/system/logs?filter=ORDER-FULFILLMENT
```

---

## Comandos de Diagnóstico (si algo falla)

```bash
# Verificar conexión a ML
GET /api/diagnostics/connection/mercadolibre

# Verificar conexión a AliExpress
GET /api/diagnostics/connection/aliexpress

# Estado del sistema completo
GET /api/diagnostics
```

---

## Checklist Final Pre-Activación

```
✅ Producto 32722: currency=USD, suggestedPrice=$9.99, status=VALIDATED_READY
✅ WorkflowConfig: hybrid/manual/manual/production
⬜ Listing republicado con footer legal (legalTextsAppended=true)
⬜ Precio en ML: ~9,000-10,000 CLP (verificado visualmente)
⬜ overallReadiness: "ready" o "partial"
⬜ Listing status: active (no under_review ni forbidden)
⬜ Operador disponible para monitorear (dentro de 24h de primera orden)
```

Una vez todos los checks estén en ✅, el sistema está listo para recibir la primera orden real.

---

## GO / NO-GO — Primera Orden Real

### Condiciones para GO ✅

1. Listing republicado con footer legal → `legalTextsAppended = true`
2. Precio correcto en ML (~9,990 CLP)
3. `overallReadiness = "ready"` o `"partial"` (ver [ML_CHILE_TRUTH_VERIFICATION.md](ML_CHILE_TRUTH_VERIFICATION.md))
4. `stageFulfillment = manual` (ya aplicado ✅)
5. Operador disponible

### Condiciones de NO-GO ❌

- Listing en status `forbidden` por ML
- `legalTextsAppended = false` (footer no aplicado)
- Precio visible en ML es 6 CLP (bug de precio)
- `workflowMode = automatic` (riesgo de compra sin supervisión)

### Veredicto Actual

**PARTIAL GO — PENDIENTE DE REPUBLISH**

El sistema está técnicamente listo. Falta ejecutar el republish desde la app en Railway para aplicar el footer legal y el precio correcto. Una vez hecho, el sistema estará en **GO completo** para la primera orden.

---

## Próximos Pasos Post-Primera Orden

Una vez completada exitosamente la primera orden:

1. Activar `stageFulfillment = guided` (semi-automático con validación)
2. Implementar `<MLChileTruthPanel />` en `ProductPreview.tsx` (ver [ML_CHILE_FRONTEND_OPERATIONAL_ALIGNMENT.md](ML_CHILE_FRONTEND_OPERATIONAL_ALIGNMENT.md))
3. Automatizar tracking sync AliExpress → ML (cron job)
4. Escalar a 2-3 productos en ML Chile
5. Considerar `workflowMode = automatic` con límites diarios conservadores
