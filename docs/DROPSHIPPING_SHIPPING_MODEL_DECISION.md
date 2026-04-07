# Dropshipping Shipping Model Decision

**Fecha:** 2026-04-04  
**Scope:** Ivan Reseller Web — AliExpress → Mercado Libre Chile

---

## Arquitectura elegida: Híbrida de 2 capas

### Capa 1 — Supplier Freight Truth (interna, operativa)
- **Fuente de verdad real**: AliExpress DS API `aliexpress.logistics.buyer.freight.calculate`
- **Granularidad**: País (CL). La API no soporta ciudad/comuna/código postal.
- **Persistencia**: `productData.mlChileFreight` con TTL de 72h en publish-time, 7 días en order-time
- **Recalculo**: automático al entrar una orden real (`resolveOrderTimeFreightTruth`)
- **Gate de rentabilidad**: `checkOrderTimeProfitability` bloquea auto-compra si freight destruye margen

### Capa 2 — Marketplace Shipping Representation (ML, externa)
- **Modo oficial**: `me2 + handling_time: 25` (AliExpress Standard Shipping ~20-45 días)
- **Limitación conocida**: ML revierte me2→not_specified para algunas categorías (`lost_me2_by_catalog`)
- **Mitigación**: descripción con info de envío internacional explícita

---

## Por qué esta arquitectura y no otras

| Alternativa | Descartada por |
|-------------|----------------|
| Quote dinámico por comprador en ML | ML no soporta shipping dinámico por listing |
| Warehouse en Chile + me2 real | Costo operativo prohibitivo para micro SaaS |
| ML Flex internacional | Requiere habilitación especial ML; no disponible |
| `not_specified` permanente | Menos confianza del comprador; mismo riesgo de forbidden |
| 3PL/forwarding | Capa operacional extra; no automatizable fácil |

**Decisión**: mantener la separación interna/externa. La verdad del flete es interna. ML muestra
`me2 + handling_time` como mejor aproximación honesta disponible.

---

## Diagnóstico actual (2026-04-04)

| Campo | Estado | Evaluación |
|-------|--------|-----------|
| `mlChileFreight` persistido | ✅ `selectedFreightAmount: 1.99 USD` | Correcto |
| ML listing mode | ⚠️ `not_specified` (ML revirtió me2) | Workaround activo |
| Descripción con ETA | ✅ Actualizada (20-30 días hábiles) | Correcto |
| Order-time freight recheck | ✅ Implementado | Nuevo |
| Profitability gate | ✅ Implementado | Nuevo |
| ML listing MLC3838173870 | ❌ `under_review: forbidden` | Bloqueado por ML |

---

## Reglas de negocio fijas

1. **Nunca publicar con `free_shipping: true`** cuando `selectedFreightAmount > 1 USD`
2. **`handling_time: 25`** es el mínimo honesto para AliExpress Standard CN→CL
3. **La descripción debe siempre incluir** mención de envío internacional y ETA real
4. **El freight real del proveedor** debe estar en `productData.mlChileFreight` antes de publicar
5. **Si el freight revierte a not_specified en ML**, la descripción es el fallback obligatorio
6. **Gate de rentabilidad**: `AUTO_PURCHASE_BLOCKED_BY_FREIGHT` si netProfit < 0

---

## Siguiente paso pendiente

El problema de `under_review:forbidden` en listings activos (MLC3838173870) está relacionado con
la tensión `mandatory_settings.mode=me2` de la cuenta vs. `not_specified` en el listing.

Opciones:
1. Solicitar a ML soporte para modo `not_specified` en cuenta de dropshipping internacional
2. Investigar si ML tiene un modo `international` o `cross_border` habilitado para esta cuenta
3. Testear publicar con product category diferente donde me2 no se revierta
