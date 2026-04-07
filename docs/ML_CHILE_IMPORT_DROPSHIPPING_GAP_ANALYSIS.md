# ML Chile Import Dropshipping — Gap Analysis
**Fecha:** 2026-04-04  
**Fase:** Post-Phase-0, Cycle 1 Operational Alignment  
**Referencia:** Resumen Ejecutivo — Dropshipping Importado ML Chile

---

## A.1 — Requerimientos del Resumen Ejecutivo vs Estado del Software

### PUBLICACIÓN / LISTING

| Requerimiento | Estado antes | Estado después |
|---|---|---|
| Título claro, sin mayúsculas excesivas, max 60 chars ML | ✅ CUBIERTO — `sanitizeTitleForML()` | ✅ Sin cambios |
| Fotos de calidad sobre fondo claro | ✅ CUBIERTO — image pipeline + AI bg removal | ✅ Sin cambios |
| Atributos obligatorios (marca, modelo, color) | ✅ CUBIERTO — auto-resolve desde ML category API | ✅ Sin cambios |
| Tipo de publicación (Clásica/Premium → gold_special/free) | ✅ CUBIERTO — fallback loop | ✅ Sin cambios |
| Origen declarado ("Producto importado de China") | ❌ AUSENTE — descripción AI no garantizaba esto | ✅ IMPLEMENTADO — footer obligatorio |
| "Envío Internacional de Mercado Libre" indicado | ❌ PARCIAL — sólo cuando me2 se logra | ✅ MEJORADO — ETA en footer siempre |
| Impuestos estimados (19% IVA) declarados | ❌ AUSENTE — no había cláusula automática | ✅ IMPLEMENTADO — footer incluye cláusula IVA |

### ATRIBUTOS Y DATOS OBLIGATORIOS

| Requerimiento | Estado antes | Estado después |
|---|---|---|
| BRAND atributo | ✅ `inferBrandFromTitle()` → "Genérico" | ✅ Sin cambios |
| MODEL atributo | ✅ Auto-inferred | ✅ Sin cambios |
| COLOR, MATERIAL (opcionales importantes) | ✅ Extraídos del título | ✅ Sin cambios |
| Condición "Nuevo" | ✅ hardcoded `'new'` | ✅ Sin cambios |
| Categoría ML | ✅ `predictCategory()` | ✅ Sin cambios |

### SHIPPING INTERNACIONAL Y PLAZOS

| Requerimiento | Estado antes | Estado después |
|---|---|---|
| ETA real en descripción | ⚠️ PARCIAL — sólo si `estimatedDeliveryDays` en productData | ✅ GARANTIZADO — footer siempre incluye ETA |
| Handling time configurable | ✅ `mlHandlingTimeDays` en workflow config | ✅ Sin cambios |
| me2 mode intent | ✅ Intentado post-creation | ✅ Sin cambios + shippingTruthStatus en DB |
| Shipping truth status en DB | ❌ AUSENTE — sólo en logs | ✅ IMPLEMENTADO — `shippingTruthStatus` en MarketplaceListing |
| Plazos realistas visibles al comprador | ⚠️ Sólo si me2 funciona | ✅ MEJORADO — ETA siempre en descripción |

### TEXTOS LEGALES / COMERCIALES

| Requerimiento | Estado antes | Estado después |
|---|---|---|
| Garantía legal 6 meses (Ley 19.496) | ❌ AUSENTE — no automatizado | ✅ IMPLEMENTADO — footer |
| Derecho de retracto 10 días | ❌ AUSENTE | ✅ IMPLEMENTADO — footer |
| Precio incluye IVA (19%) | ❌ AUSENTE | ✅ IMPLEMENTADO — footer |
| Datos de contacto / canal | ❌ AUSENTE | ✅ IMPLEMENTADO — "preguntas del producto" en footer |
| Tracking: "tracking incluido" | ❌ AUSENTE | ✅ IMPLEMENTADO — footer |
| `legalTextsAppended` trackeado en DB | ❌ AUSENTE | ✅ IMPLEMENTADO — campo en MarketplaceListing |

### IMPUESTOS / IVA / ARANCELES

| Requerimiento | Estado antes | Estado después |
|---|---|---|
| `taxCalculatorService` con CL 19% IVA | ✅ CUBIERTO — service existe y es correcto | ✅ Sin cambios |
| IVA integrado en profitability gate | ✅ CUBIERTO — `importTax` en totalCost | ✅ Sin cambios |
| Cláusula "ML cobra el IVA; sin cargos extra en aduana" | ❌ AUSENTE | ✅ IMPLEMENTADO — footer |
| `taxCalculatorService` integrado en publish flow | ❌ No llamado explícitamente en publish | ⚠️ Pendiente: se usa implícitamente via `importTax` en Product |
| Arancel estimado (6% para CL) | ✅ En `taxCalculatorService` | ✅ Sin cambios (aplicado en pricing, no en listing text) |

### TRACKING Y POSTVENTA

| Requerimiento | Estado antes | Estado después |
|---|---|---|
| Order sync ML → DB | ✅ `mercadolibre-order-sync.service.ts` | ✅ Sin cambios |
| Order pipeline PAID→PURCHASING→PURCHASED | ✅ `order-fulfillment.service.ts` | ✅ Sin cambios |
| Freight truth at order time | ✅ `resolveOrderTimeFreightTruth()` | ✅ Sin cambios |
| Profitability gate at purchase time | ✅ Implementado | ✅ Sin cambios |
| Manual escalation queue | ✅ `MANUAL_ACTION_REQUIRED` status | ✅ Sin cambios |
| Tracking number sync | ⚠️ PARCIAL — sincronización desde AliExpress DS API | ⚠️ Sin cambios (limitación API) |

### LOGS / AUDITORÍA

| Requerimiento | Estado antes | Estado después |
|---|---|---|
| Logs de publicación | ✅ Winston logs | ✅ Sin cambios |
| Business truth log at publish | ❌ AUSENTE | ✅ IMPLEMENTADO — `logMLChilePublishTruth()` |
| `shippingTruthStatus` persisted | ❌ Sólo en log | ✅ IMPLEMENTADO — en DB |
| `legalTextsAppended` persisted | ❌ Ausente | ✅ IMPLEMENTADO — en DB |
| `importHandlingTimeDays` persisted | ❌ Ausente | ✅ IMPLEMENTADO — en DB |

### UX / FRONTEND

| Requerimiento | Estado antes | Estado después |
|---|---|---|
| Configuración ETA/handling time | ✅ WorkflowConfig con `mlHandlingTimeDays` | ✅ Sin cambios |
| Vista de shipping truth por producto | ❌ AUSENTE | ✅ Disponible via endpoint `/ml-chile-truth/:productId` |
| Panel de compliance por listing | ❌ AUSENTE | ✅ Disponible via endpoint `/ml-chile-checklist/:productId` |
| Frontend que consume estos endpoints | ❌ AUSENTE | ⚠️ PENDIENTE — endpoints listos, UI no implementada |

---

## A.2 — Clasificación de Gaps Detectados

### Gaps Críticos (bloqueaban operación real correcta)
1. **Textos legales NO incluidos en descripción**: Producto podía publicarse sin garantía, retracto ni IVA declarados → **RESUELTO**
2. **Shipping truth NO persistido en DB**: No había forma de saber post-publish si me2 fue o no enforcement → **RESUELTO**
3. **"Producto importado de China" NO declarado automáticamente**: Violaba obligación de indicar origen → **RESUELTO**
4. **ETA no garantizado en descripción**: Sólo cuando productData tenía estimatedDeliveryDays → **RESUELTO**

### Gaps No Críticos / Advertencias
5. **`taxCalculatorService` no llamado explícitamente en publish**: IVA se maneja via `importTax` pero el service no se invoca en el publish path → Documentado; el cálculo es correcto via `totalCost`
6. **Frontend sin vista de compliance/truth**: Los endpoints existen; falta UI → Pendiente fase siguiente
7. **Tracking AliExpress→comprador**: Depende de DS API y ML webhook sync → Limitación de plataforma, documentada

### Gaps No Implementables (Limitaciones ML/AliExpress)
- **me2 mode en listings activos**: ML no permite cambiar shipping.mode después de activar → Documentado en código y en DB como `me2_attempted_not_enforced`
- **ETA guarantee en listing ML**: ML no expone campo de ETA personalizado para vendedores internacionales; sólo via descripción
- **Tracking automático desde AliExpress**: API DS no proporciona tracking en tiempo real consistentemente

---

## A.3 — Impacto de los Cambios Implementados

| Área | Antes | Después |
|---|---|---|
| Listings ML Chile nuevos | Sin textos legales ni origen | Con footer legal completo |
| Shipping truth | Sólo en logs | En DB + auditable |
| Operator visibility | Sin panel consolidado | 2 endpoints de truth + checklist |
| Audit trail at publish | Sin log de verdad de negocio | `logMLChilePublishTruth()` en cada publish |
| Schema | Sin campos de compliance | 3 nuevos campos en MarketplaceListing |
