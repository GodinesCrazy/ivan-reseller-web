# ML Chile — Business Truth Verification
**Fecha:** 2026-04-04  
**Producto:** 32722 — Soporte Escritorio Gatito  
**Propósito:** Verificar el truth model post-republish y confirmar readiness para primera orden real

---

## Qué es el Business Truth Model

El truth model captura el estado operativo real en el momento de publicar:  
no lo que "queremos" que sea, sino lo que realmente ocurrió en ML Chile.

Implementado en: `backend/src/services/ml-chile-import-compliance.service.ts`

---

## Endpoints de Verificación

### 1. Truth Model Completo

```
GET /api/workflow/ml-chile-truth/32722
```

**Respuesta esperada post-republish:**

```json
{
  "productId": 32722,
  "marketplace": "mercadolibre",
  "truth": {
    "origin": {
      "country": "China",
      "supplier": "AliExpress",
      "declared": true
    },
    "eta": {
      "minDays": 20,
      "maxDays": 40,
      "label": "20-40 días hábiles",
      "basis": "configured",
      "handlingTimeDays": 30
    },
    "shippingTruth": {
      "status": "me2_enforced",
      "me2Attempted": true,
      "knownLimitation": null
    },
    "taxCompliance": {
      "ivaRate": 0.19,
      "ivaHandledByML": true,
      "importDutyRate": 0.06,
      "declaredInDescription": true
    },
    "legalTexts": {
      "guaranteeMonths": 6,
      "retractoDays": 10,
      "footerAppended": true,
      "mandatoryTextsPresent": true
    },
    "fulfillmentReadiness": {
      "aliexpressUrlPresent": true,
      "profitabilityGateOk": true,
      "manualInterventionRequired": true,
      "notes": "stageFulfillment=manual — primera orden requiere confirmación del operador"
    },
    "overallReadiness": "ready"
  }
}
```

**Si me2 no fue enforced (caso esperado para MLC):**
```json
"shippingTruth": {
  "status": "me2_attempted_not_enforced",
  "me2Attempted": true,
  "knownLimitation": "ML Chile revierte me2 para esta categoría. ETA en descripción compensa."
},
"overallReadiness": "partial"
```

---

### 2. Checklist Operativo

```
GET /api/workflow/ml-chile-checklist/32722
```

**Respuesta esperada:**

```json
{
  "productId": 32722,
  "checklist": [
    { "item": "AliExpress URL presente", "ok": true, "critical": true },
    { "item": "Precio > Costo total", "ok": true, "critical": true },
    { "item": "Textos legales en descripción", "ok": true, "critical": false },
    { "item": "Garantía legal (6 meses) declarada", "ok": true, "critical": false },
    { "item": "Derecho de retracto (10 días) declarado", "ok": true, "critical": false },
    { "item": "Cláusula IVA declarada", "ok": true, "critical": false },
    { "item": "Origen importado declarado", "ok": true, "critical": false },
    { "item": "ETA internacional en descripción", "ok": true, "critical": false },
    { "item": "Shipping mode documentado en DB", "ok": true, "critical": false }
  ],
  "overallReadiness": "ready",
  "criticalItemsPassed": 2,
  "criticalItemsTotal": 2
}
```

---

## Verificación en DB

Ejecutar directamente en Railway Postgres (o vía Prisma Studio):

```sql
-- Estado del listing más reciente
SELECT 
  l."listingId",
  l."status",
  l."legalTextsAppended",
  l."shippingTruthStatus",
  l."importHandlingTimeDays",
  l."publishedAt",
  l."listingUrl"
FROM marketplace_listings l
WHERE l."productId" = 32722
ORDER BY l."publishedAt" DESC NULLS LAST
LIMIT 1;
```

**Criterios de aceptación:**

| Campo | Valor aceptado | Notas |
|---|---|---|
| `status` | `active` | Si es `under_review`, esperar 24-48h |
| `legalTextsAppended` | `true` | **OBLIGATORIO** |
| `shippingTruthStatus` | `me2_enforced` o `me2_attempted_not_enforced` | Ambos son aceptables |
| `importHandlingTimeDays` | `30` | Confirmación de config aplicada |
| `listingUrl` | URL válida | Para verificación visual |

---

## Verificación Visual en Mercado Libre

Abrir `listingUrl` en el browser y confirmar que la descripción contiene:

```
✅ "Producto importado de China"
✅ "Tiempo estimado de entrega: 20-40 días hábiles"
✅ "Garantía legal: 6 meses por defectos de fabricación (Ley 19.496)"
✅ "Derecho de retracto: 10 días desde recepción"
✅ "Precio incluye IVA (19%)"
✅ Precio ~9,000-10,000 CLP (no 6.01 CLP)
```

---

## Interpretación de Resultados

### ✅ GO — overallReadiness: "ready"

- me2 enforced correctamente
- Footer legal presente
- Precio correcto en CLP
- Sistema listo para primera orden real

### ⚠️ PARTIAL GO — overallReadiness: "partial"

- me2 no enforced (ML lo revirtió) — aceptable, ETA en descripción compensa
- Footer legal presente — cumplimiento legal OK
- Proceder con primera orden bajo condiciones documentadas

### ❌ NO-GO — overallReadiness: "not_ready"

- `legalTextsAppended: false` → Republicar
- `status: forbidden` → Revisar política ML para la categoría
- `status: under_review` → Esperar o republicar con categoría diferente
- Precio incorrecto en listing → Revisar FX service

---

## Logs Esperados en Railway

Al publicar, buscar en logs de Railway:

```
[ML Publish] ML Chile import footer appended { productId: 32722, footerAppended: true }
[ML-CHILE-COMPLIANCE] Business truth at publish time { ... overallReadiness: 'ready' }
[MercadoLibre] me2 shipping enforced post-creation { itemId: 'MLC...', handlingTime: 30 }
```

O si me2 no fue enforced:
```
[MercadoLibre] SHIPPING_TRUTH_NOT_ENFORCED_ON_ML { itemId: 'MLC...', error: '...' }
```

---

## Historial de Publicaciones Previas (Referencia)

| Listing | Fecha | Precio enviado | legalTextsAppended |
|---|---|---|---|
| MLC3838173870 | 2026-04-04 18:20 | ~6.01 CLP (bug) | false |
| MLC3838127822 | 2026-04-04 17:14 | ~6.01 CLP (bug) | false |
| MLC3828805540 | 2026-04-03 00:38 | ~6.01 CLP (bug) | false |
| Próximo publish | 2026-04-04+ | ~9,990 CLP ✅ | true ✅ |

El historial confirma que todos los listings anteriores usaron el precio incorrecto. El próximo publish (post-fix) será el primero operativamente correcto.
