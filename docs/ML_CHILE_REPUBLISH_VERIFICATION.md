# ML Chile — Verificación de Republish con Footer Legal
**Fecha:** 2026-04-04  
**Producto:** 32722 — Soporte Escritorio Teléfono Gatito Decorativo Minimalista Stand Celular  
**Objetivo:** Republicar el listing en ML Chile con footer legal obligatorio y precio corregido

---

## Estado Pre-Republish (Auditado)

### Producto 32722 — Correcciones Aplicadas

| Campo | Antes | Después | Estado |
|---|---|---|---|
| `currency` | `CLP` (incorrecto) | `USD` | ✅ Corregido |
| `suggestedPrice` | `6.01` (6 CLP ≈ $0) | `9.99` USD | ✅ Corregido |
| `totalCost` | `1360.99` (CLP mixed) | `4.39` USD | ✅ Corregido |
| `shippingCost` | `1.99` | `1.99` USD | ✅ Sin cambio |
| `importTax` | `0.70` | `0.70` USD | ✅ Sin cambio |
| `aliexpressUrl` | https://www.aliexpress.com/item/3256810079300907.html | — | ✅ Presente |
| `status` | `VALIDATED_READY` | — | ✅ Listo |

**Causa raíz del error de precio:** `currency = CLP` hacía que el publish flow saltara la conversión FX y enviara `6.01 CLP` directamente a ML como precio del listing (< $0.01 USD — esencialmente gratis). Con `currency = USD`, el FX service convierte correctamente: `$9.99 USD → ~9990 CLP`.

### WorkflowConfig — Estado de Seguridad

| Campo | Valor | Estado |
|---|---|---|
| `workflowMode` | `hybrid` | ✅ Correcto |
| `stageFulfillment` | `manual` | ✅ Crítico — primera orden manual |
| `stagePurchase` | `manual` | ✅ Crítico — primera orden manual |
| `environment` | `production` | ✅ Producción |
| `mlHandlingTimeDays` | `30` | ✅ ETA 20-40 días hábiles |

### Listings Anteriores (Todos Superseded)

| Listing ID | Status | legalTextsAppended | publishedAt |
|---|---|---|---|
| MLC3838173870 | superseded | false | 2026-04-04 18:20 |
| MLC3838127822 | superseded | false | 2026-04-04 17:14 |
| MLC1913646427 | failed_publish | false | — |
| ... (13 más) | superseded | false | — |

**Ningún listing activo en DB.** El listing que el operador ve como "activo" en ML podría ser MLC3838173870 (el más reciente). Todos fueron publicados sin footer legal y con precio incorrecto.

---

## Footer Legal que se Appenderá

Con `mlHandlingTimeDays = 30`, el footer que se añadirá a la descripción es:

```
---
Producto importado de China | Envío internacional con tracking incluido.
Tiempo estimado de entrega: 20-40 días hábiles desde China.
Garantía legal: 6 meses por defectos de fabricación (Ley 19.496).
Derecho de retracto: 10 días desde recepción (Ley del Consumidor).
Precio incluye IVA (19%) según normativa digital chilena. Sin cargos adicionales de importación.
Consultas: usa el sistema de preguntas del producto en Mercado Libre.
```

**Límite ML:** 5000 caracteres para descripción. El footer es ~350 chars. Si la descripción existente es larga, se trunca a 4650 chars antes de appendar.

---

## Procedimiento de Republish

### Pasos en la Aplicación (Railway)

1. **Abrir la app en producción** (Railway URL)
2. **Ir a Products → Producto 32722** (Soporte Escritorio Gatito)
3. **Verificar precio:** Debe mostrar $9.99 USD (con el fix aplicado)
4. **Hacer click en "Publicar en Mercado Libre"** (o equivalente)
5. **El sistema automáticamente:**
   - Genera título optimizado (AI)
   - Genera descripción + appenda footer legal
   - Convierte $9.99 USD → CLP via FX service
   - Publica en ML Chile
   - Intenta enforcer me2 shipping con handling_time=30
   - Captura shippingTruthStatus post-creación
   - Persiste `legalTextsAppended=true` en DB

### Verificación Post-Publish

Ejecutar en Railway console o vía API:

```bash
# 1. Verificar truth model
GET /api/workflow/ml-chile-truth/32722

# 2. Verificar checklist
GET /api/workflow/ml-chile-checklist/32722
```

**Campos críticos a confirmar:**
- `legalTextsAppended: true`
- `shippingTruthStatus: "me2_enforced"` (o `"me2_attempted_not_enforced"` — ver limitación L1)
- `overallReadiness: "ready"` (o `"partial"` si me2 no se enforzó)
- `importHandlingTimeDays: 30`

---

## Precio en ML Chile

Con `suggestedPrice = $9.99 USD` y `FX ~ 950-1000 CLP/USD`:

| Escenario | Precio en CLP |
|---|---|
| 950 CLP/USD | 9,490 CLP |
| 980 CLP/USD | 9,782 CLP |
| 1000 CLP/USD | 9,990 CLP |

**Análisis de rentabilidad:**

| Item | USD | CLP (a 970) |
|---|---|---|
| Precio de venta | $9.99 | ~9,690 CLP |
| Costo AliExpress | -$1.70 | -1,649 CLP |
| Envío | -$1.99 | -1,931 CLP |
| Arancel/impuesto | -$0.70 | -679 CLP |
| Comisión ML ~17% | -$1.70 | -1,647 CLP |
| **Margen neto est.** | **~$3.90** | **~3,784 CLP** |

Margen neto estimado: ~39% — **ACEPTABLE para prueba controlada.**

---

## Evidencia de Compliance Post-Republish

Una vez republicado, confirmar en DB:

```sql
SELECT "listingId", "status", "legalTextsAppended", 
       "shippingTruthStatus", "importHandlingTimeDays", "publishedAt"
FROM marketplace_listings
WHERE "productId" = 32722
ORDER BY "publishedAt" DESC
LIMIT 1;
```

**Resultado esperado:**
```
listingId              | MLC3XXXXXXXXX
status                 | active
legalTextsAppended     | true
shippingTruthStatus    | me2_enforced (o me2_attempted_not_enforced)
importHandlingTimeDays | 30
publishedAt            | 2026-04-04 XX:XX
```

---

## Estado: PENDIENTE DE EJECUCIÓN

El código del footer legal está implementado y listo en el backend.  
El precio del producto ha sido corregido ($9.99 USD, currency=USD).  
El WorkflowConfig está en modo seguro (hybrid/manual/manual).  

**Acción requerida:** El operador debe ejecutar la publicación desde la app en producción (Railway).  
El sistema aplicará el footer automáticamente en el próximo publish.
