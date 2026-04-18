# CJ → ML Chile / Products Screen — Enrichment Guide

**Fecha**: 2026-04-18  
**Commit**: 8dd4822

---

## 1. QUÉ ESTABA MAL ANTES

| Problema | Impacto |
|----------|---------|
| Bug crítico: frontend usaba `imageUrls` pero backend devuelve `mainImageUrl` | Imágenes en blanco en todos los resultados |
| Lista plana sin agrupación por viabilidad | Operador no sabía qué productos tenían stock |
| Sin estimado CLP en cards | No se podía comparar precio sin hacer preview |
| Sin variant picker | Operador debía conocer el SKU CJ de memoria |
| Sin stats de búsqueda | Sin contexto de cuántos resultados son viables |
| Sin badges REAL/ESTIMATED | Datos presentados sin señal de confianza |
| Sin warehouse badge en search | Sin señal visual de viabilidad Chile en la lista |

---

## 2. QUÉ SE TOMÓ DE REFERENCIA DE CJ → EBAY USA

- **Grid de cards** con imagen square y badges → adaptado para ML Chile con columna CLP
- **Grouping de resultados** en 3 tiers por operabilidad → mismo patrón, mismos nombres de función
- **Variant picker** con auto-fetch de `/cj/product/:id` y sorted operables-first → idéntico concepto
- **Stats banner** con summary de operabilidad → adaptado incluyendo FX rate
- **`SearchOperabilityStatus`** helper → reimplementado como `operabilityOf()`
- **`groupSearchResults()`** → reimplementado como `groupItems()`

---

## 3. QUÉ SE ENRIQUECIÓ EN BACKEND

### `POST /api/cj-ml-chile/cj/search`

**Antes:**
```json
{ "ok": true, "items": [...], "note": "MVP: warehouse Chile..." }
```

**Ahora:**
```json
{
  "ok": true,
  "items": [...],
  "operabilitySummary": { "operable": 8, "stockUnknown": 5, "unavailable": 7 },
  "fxRateCLPperUSD": 926.5,
  "fxRateAt": "2026-04-18T14:32:00.000Z",
  "note": "Warehouse Chile se verifica en preview/evaluate. CLP es estimado con FX actual."
}
```

`fxService.convert(1, 'USD', 'CLP')` — usa el FX service ya importado en el módulo.

---

## 4. QUÉ SE REDISEÑÓ EN FRONTEND

### Layout

```
┌─────────────────────────────────────────────┐
│ [Search input                    ] [Buscar]  │
│ Busca, selecciona variante, revisa...        │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ 20 resultados  ● 8 con stock  ● 5 confirmar │
│ ● 7 sin stock          FX: $926 CLP  [EST]  │
└─────────────────────────────────────────────┘

CON STOCK CONFIRMADO (8) — Listos para evaluar
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ img  │ │ img  │ │ img  │ │ img  │
│title │ │title │ │title │ │title │
│$X USD│ │$X USD│ │      │ │      │
│[REAL]│ │[REAL]│ │      │ │      │
│≈XCLP │ │      │ │      │ │      │
│[EST] │ │      │ │      │ │      │
│[stck]│ │      │ │      │ │      │
│[wh?] │ │      │ │      │ │      │
│[Sel] │ │      │ │      │ │      │
└──────┘ └──────┘ └──────┘ └──────┘

▶ STOCK POR CONFIRMAR (5) — Revisar en evaluate
▶ SIN STOCK (7) — No recomendados

┌─────────────────────────────────────────────┐
│ PRODUCTO SELECCIONADO                        │
│ [img] Título del producto                    │
│       $12.50 USD [REAL]  ≈ $11,581 [EST]    │
│       [En stock (32)] [WH Chile: verificar]  │
│                                              │
│ VARIANTE                                     │
│ Con stock:                                   │
│ [Color: Rojo · $12.50 · Stock: 32 ✓]        │
│ [Color: Azul · $11.00 · Stock: 15  ]        │
│ ▶ Sin stock (2)                              │
│                                              │
│ [Resumen variante seleccionada]              │
│                                              │
│ Cantidad: [1]                                │
│ [Preview pricing] [Evaluate (persistir)]     │
│                                              │
│ [Preview / Evaluate result aquí...]         │
└─────────────────────────────────────────────┘
```

---

## 5. QUÉ VE AHORA EL OPERADOR

### Por cada resultado de búsqueda
1. Imagen del producto (lazy-loaded)
2. Título (2 líneas max)
3. Precio CJ en USD — badge **REAL**
4. Precio estimado en CLP — badge **ESTIMATED**
5. Badge de stock: "En stock (N)" / "Sin stock" / "Stock por confirmar"
6. Badge de warehouse Chile: "WH Chile: verificar" (PENDING en search)
7. Botón de acción contextual: "Seleccionar" / "Revisar stock" / "Ver detalle"

### En el panel de producto seleccionado
1. Imagen + título completo
2. Precio USD (REAL) + CLP estimado (ESTIMATED)
3. Badge stock actual
4. Badge warehouse (PENDING → REAL post-preview)
5. Lista de variantes con atributos, costo (REAL), stock, SKU
6. Summary de variante seleccionada
7. Qty input con label
8. Acciones: Preview pricing + Evaluate

### Post-preview/evaluate
- Shipping: costo USD (REAL), método, ETA (REAL si Chile WH, ESTIMATED si no), origen
- Warehouse badge definitivo: 🇨🇱 Chile ✓ o "Sin WH Chile"
- Pricing table completa: USD + CLP columns, FX rate, todos los fees con labels
- Decision badge: APPROVED / REJECTED / PENDING / NOT_VIABLE
- Reasons con colores por severidad
- Flujo de categoría + draft (si APPROVED)

---

## 6. CLASIFICACIÓN REAL / ESTIMATED / PENDING

| Dato | Badge | Razón |
|------|-------|-------|
| Precio CJ USD en search | REAL | Viene directo de `product/listV2` |
| CLP en search cards | ESTIMATED | FX rate de servicio externo |
| Costo variante | REAL | Viene de `variantSellPrice` CJ |
| Envío CJ | REAL | Quote de `freightCalculate` |
| ETA | REAL si WH CL, ESTIMATED si CN/otras | Depende de origen confirmado |
| CLP en pricing table | ESTIMATED | FX rate; siempre estimado |
| Warehouse Chile | PENDING en search, REAL post-preview | No se prueba en search (costoso) |
| Margen neto | Depende de FX | Calculado sobre CLP estimado |

---

## 7. PARIDAD CON CJ → EBAY USA

**Alcanzada** en los ejes principales:
- ✅ Grid de cards con imágenes
- ✅ Grouping por operabilidad (3 tiers)
- ✅ Variant picker auto-populate
- ✅ Stats banner
- ✅ Badges REAL/ESTIMATED en cada dato
- ✅ Warehouse signal (PENDING → REAL)
- ✅ Selected product panel completo
- ✅ Pricing breakdown detallado

**Diferencias intencionales** (correctas para ML Chile, no gaps):
- CLP siempre ESTIMATED (no existe equivalente en eBay USA que es todo USD)
- Warehouse detection en search NO implementada (sería 20 calls extra por búsqueda, inaceptable en MVP)
- Risk score numérico NO implementado (ML Chile usa APPROVED/REJECTED/NOT_VIABLE binario)
- No hay inline pricing config editor (eBay USA lo tiene; ML Chile lo tiene en Settings separado)

---

## 8. VALIDACIÓN

```
backend tsc --noEmit   → 0 errores
frontend tsc --noEmit  → 0 errores
frontend npm run build → ✓ built in 15.46s (sin warnings)
```
