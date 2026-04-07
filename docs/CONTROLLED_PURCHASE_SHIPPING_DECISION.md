# Controlled Purchase — Shipping Decision

**Fecha:** 2026-04-04  
**Producto:** Soporte Escritorio Teléfono Gatito (ID: 32722)

---

## DECISIÓN: PARTIAL GO

### Motivo exacto

**El Shipping Cost Engine está listo para una compra real.** Todos los componentes del modelo de flete
están implementados, validados y auditados.

**El bloqueante no es el shipping engine.** Es el listing en Mercado Libre.

---

## ✅ Lo que está listo (Shipping Engine)

| Componente | Estado |
|-----------|--------|
| Freight truth persistida (`mlChileFreight`) | ✅ $1.99 USD, checkeada 2026-04-01 |
| AliExpress freight re-quote al entrar orden | ✅ Implementado en `order-time-freight.ts` |
| Gate de rentabilidad (auto-purchase) | ✅ Implementado en `order-fulfillment.service.ts` |
| Captura de ML sale amount (CLP) en order sync | ✅ `_mlSaleAmountCLP` en shippingAddress JSON |
| Dirección real del comprador hacia AliExpress | ✅ city, state, zipCode desde ML order |
| Representación honesta en descripción ML | ✅ "20 a 30 días hábiles desde China" |
| Flags de status (`SHIPPING_TRUTH_OK`, etc.) | ✅ Auditables en logs |
| Tests del profitability gate | ✅ `order-time-freight.test.ts` |
| Documentación completa | ✅ 7 docs generados |

---

## ❌ El bloqueante real: listing forbidden

```
MLC3838173870: under_review:forbidden
```

**Causa raíz:** ML tiene `mandatory_settings.mode: 'me2'` para esta cuenta. Durante el POST,
ML revierte `me2 → not_specified` (`lost_me2_by_catalog`). Listing activo con `not_specified` +
cuenta con mandatory_settings `me2` → compliance automático marca `forbidden`.

**No es un bug de código.** Es un conflicto entre la cuenta de vendedor y el behavior de ML
para la categoría MLC3530 (soporte para celular).

---

## Requisitos antes de READY completo

### Requisito 1 (Bloqueante): Listing activo en ML

Al menos uno de:

**Opción A** — Probar otra categoría ML:
```bash
# Buscar categoría donde me2 no se revierta
# Candidatos: MLC5726 (Accesorios para Teléfonos), MLC1648 (Electrónica)
```

**Opción B** — Solicitar excepción de shipping a ML soporte:
- Contactar soporte.mercadolibre.cl
- Explicar modelo dropshipping internacional
- Solicitar que la cuenta permita `not_specified` o tenga `mandatory_settings` anulado

**Opción C** — `free_shipping: true` en categoría diferente:
- Absorber $1.99 en precio: subir precio en ~$2 USD ≈ +1,900 CLP
- Usar `free_shipping: true` → puede cambiar el comportamiento del catalog

### Requisito 2 (No bloqueante, pero recomendado): Corregir `Order.price`

Actualmente `Order.price` almacena supplier cost. Si la decisión es hacer `Order.price = ML sale price`,
requeriría migración y refactor del capital check. Se puede diferir post-primera venta.

---

## Número de ventas necesario para validar el modelo completo

**Primera venta real**: validar que:
1. ML order sync captura `total_amount` (CLP) correctamente
2. Freight gate calcula correctamente con el precio real
3. AliExpress acepta dirección chilena del comprador
4. Tracking chino es aceptado por ML shipment me2
5. El comprador recibe el paquete en el tiempo declarado (~25 días)

---

## Criterios para escalar a READY

| Criterio | Estado |
|---------|--------|
| Listing activo en ML (no forbidden) | ❌ Pendiente |
| Shipping engine implementado | ✅ |
| Gate de rentabilidad operativo | ✅ |
| Freight truth fresca (≤ 7 días) | ⚠️ Expira en 4 días (quote de 2026-04-01) |
| Capital suficiente ($5-6 USD) | A verificar |
| Primera venta real completada | ❌ Pendiente |

---

## Siguiente paso inmediato

```
ACCIÓN 1: Resolver listing forbidden
  → Probar publicar en categoría MLC5726 (Accesorios Celulares) o similar
  → Si me2 no se revierta en esa categoría → listing activo estable
  → Alternativamente: contactar ML soporte para excepción

ACCIÓN 2: Refrescar freight truth antes de primera venta
  → El quote de 2026-04-01 expira el 2026-04-08
  → Ejecutar: npx ts-node scripts/p95-recover-ml-chile-freight-32714.ts (adaptar para 32722)
  → O: se re-cotiza automáticamente en el gate al entrar la primera orden

ACCIÓN 3: Compra real controlada
  → 1 artículo
  → Verificar logs del gate de rentabilidad
  → Verificar tracking en ML
```

---

## Evaluación de riesgo para la compra real

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|-----------|
| Flete distinto al quote | Baja ($0-$3 rango) | Gate detecta si rompe margen |
| AliExpress rechaza dirección CL | Muy baja | Retry service + manual fallback |
| Tracking no aceptado en ML me2 | Media | Logging + escalado manual |
| Listing va a forbidden de nuevo | Alta (sin resolver) | **Bloqueante — resolver primero** |
| Margen negativo | No con datos actuales | Gate lo bloquearía automáticamente |

**El único riesgo real es el listing forbidden. El shipping engine en sí no es un riesgo.**
