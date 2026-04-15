# CJ → eBay USA — Plan: Buscador de Productos en Products

**Versión:** 1.3  
**Fecha:** 2026-04-14  
**Autor:** Principal Product Architect + Staff Full-Stack  
**Estado:** Implementado — ranking operativo + segmentación real de operabilidad activa (§17–§18)

---

## 1. Problema actual del flujo manual

La pantalla *Products* del módulo CJ → eBay USA exigía al usuario conocer de antemano dos identificadores técnicos de CJ:

- `productId` — identificador interno del producto en el catálogo CJ
- `variantId` — vid (preferido) o SKU de la variante específica

Ese requisito creaba una barrera de entrada inaceptable para un operador real:

1. El usuario tenía que salir del sistema, buscar el producto en el portal CJ, copiar los IDs, volver y pegarlos.
2. Un error de digitación generaba errores 400/500 sin contexto útil.
3. No había confirmación visual de que el producto era el correcto antes de lanzar pricing/evaluate.
4. El flujo era frágil y dependía de conocimiento técnico que no debería ser obligatorio.

---

## 2. Objetivo del nuevo buscador CJ

Convertir *Products* en la **puerta de entrada real** al ciclo CJ → eBay USA:

- El usuario describe lo que busca en lenguaje natural.
- El sistema consulta el catálogo CJ en tiempo real.
- Se muestran resultados visuales seleccionables.
- La selección de un producto carga automáticamente sus variantes.
- Los IDs técnicos se rellenan sin intervención del usuario.
- Recién entonces el usuario configura quantity/postal y ejecuta el pipeline.

---

## 3. Decisión de producto

El buscador **vive dentro del módulo CJ → eBay USA, sección Products**.

No se creó un módulo separado. La razón es que el buscador es la entrada al pipeline, no un módulo independiente. Separarlo rompería la coherencia del flujo y obligaría al usuario a navegar entre pantallas para completar una sola operación.

El flujo manual anterior **no se eliminó**: queda disponible como panel secundario plegable (Modo avanzado), útil para debug y fallback operativo.

---

## 4. UX propuesta (y estado actual)

### Sección A — Buscador CJ
- Input de texto libre (placeholder: "p.ej. phone holder, laptop stand…")
- Botón "Buscar" + Enter key
- Loading inline durante la búsqueda
- Empty state si no hay resultados
- Error state si falla la llamada

### Sección B — Resultados CJ
Grid responsive (1→2→3→4 columnas según viewport), ahora dividido en tres buckets:
- **Resultados operables** — flujo principal, solo productos con stock live confirmado
- **Stock por confirmar** — sección secundaria para respuestas donde todavía no hay evidencia suficiente
- **Sin disponibilidad / no operables** — sección secundaria degradada para candidatos ya descartados

Cada card muestra:
- Imagen del producto (aspect-square, object-contain)
- Título (line-clamp-2)
- Precio base si disponible (`listPriceUsd`)
- Badge de stock + badge de operabilidad
- CTA contextual (`Seleccionar`, `Revisar stock`, `Ver detalle`)
- Highlight visual cuando la card está seleccionada

### Sección C — Producto seleccionado
Al hacer clic en una card:
- Se llama `GET /api/cj-ebay/cj/product/:cjProductId`
- Se muestra imagen principal + título + productId técnico + número de variantes
- Las variantes se ordenan con `stock >= 1` primero
- **Si hay al menos una variante operable:** se auto-selecciona la primera variante disponible
- **Si hay N variantes:** se separan visualmente `Variantes operables` y `Variantes sin stock`
- **Si todas están agotadas:** se bloquea el flujo principal y se muestra advertencia explícita
- **Si hay 0 variantes:** aviso amber (edge case del fallback sintético del adapter)

### Sección D — Configuración operativa
Aparece cuando hay `productId` + `variantId` válidos:
- Campo `quantity` (número, min 1)
- Campo `destPostalCode` (USA, default "90210")
- Badge verde con los IDs técnicos activos (confirma qué se enviará al pipeline)
- Botones: Vista previa pricing / Evaluar y persistir / Crear draft listing

### Sección E — Modo avanzado (colapsado por defecto)
Panel plegable discreto al fondo de la pantalla:
- Inputs manuales para `productId`, `variantId`, `quantity`, `destPostalCode`
- Mismos botones de pipeline
- Nota explicativa: "Para debug, fallback operativo o cuando ya conoces los IDs técnicos CJ"

### Paneles de resultado (sin cambios)
- Error display (rose)
- Panel de Decisión: APPROVED / REJECTED / PENDING + riskScore + razones
- Panel de Desglose de pricing: breakdown completo con fees, márgenes, precios

---

## 5. Arquitectura backend

Se reutilizaron los endpoints existentes, pero sí se ajustó el contrato de búsqueda para exponer clasificación de operabilidad sin romper compatibilidad:

| Endpoint | Uso |
|---|---|
| `POST /api/cj-ebay/cj/search` | Búsqueda textual en catálogo CJ + `operabilityStatus` + `operabilitySummary` |
| `GET /api/cj-ebay/cj/product/:cjProductId` | Detalle del producto + variantes con stock live enriquecido |
| `POST /api/cj-ebay/pricing/preview` | Preview pricing sin persistir |
| `POST /api/cj-ebay/evaluate` | Evaluación + persistencia en BD |
| `POST /api/cj-ebay/listings/draft` | Crear draft listing |

---

## 6. Arquitectura frontend

### Archivos modificados
- `frontend/src/pages/cj-ebay/CjEbayProductsPage.tsx`
- `frontend/src/pages/cj-ebay/CjEbayLayout.tsx`

### Nuevos tipos añadidos al archivo
```typescript
type CjProductSummary = {
  cjProductId: string;
  title: string;
  mainImageUrl?: string;
  listPriceUsd?: number;
  operabilityStatus?: 'operable' | 'stock_unknown' | 'unavailable';
};

type CjVariantDetail = {
  cjSku: string;
  cjVid?: string;
  attributes: Record<string, string>;
  unitCostUsd: number;
  stock: number;
};

type CjProductDetail = {
  cjProductId: string;
  title: string;
  description?: string;
  imageUrls: string[];
  variants: CjVariantDetail[];
};
```

### Estado nuevo (además del pipeline existente)
```typescript
// Search
searchQuery, searchLoading, searchResults, searchError

// Product selection
selectedProduct, productDetailLoading, selectedVariantKey

// Advanced panel
advancedOpen
```

### Funciones nuevas
- `runSearch()` — POST /cj/search, resetea selección previa
- `selectProduct(summary)` — GET /cj/product/:id, ordena variantes y auto-selecciona la primera operable
- `chooseVariant(variant)` — solo permite elegir variantes con stock >= 1 en el flujo principal

### Funciones conservadas intactas
- `runPreview()`, `runEvaluate()`, `runDraft()`
- Helper `body()` — mismo shape de request

### Utilidades nuevas
- `variantLabel(v)` — formatea atributos como "Color: Red · Size: XL"
- `variantKey(v)` — devuelve `cjVid ?? cjSku` (misma lógica que el backend)
- `extractApiError(e, fallback)` — extrae mensaje de error de AxiosError o Error nativo
- `searchOperabilityStatus(item)` — normaliza la operabilidad del resultado CJ
- `groupSearchResults(items)` — separa operables / stock desconocido / no operables
- `sortVariantsForOperator(variants)` — prioriza variantes con stock útil

---

## 7. Endpoints reutilizados (sin cambios)

### POST /api/cj-ebay/cj/search

Request:
```json
{ "keyword": "phone holder", "page": 1, "pageSize": 20 }
```

Response:
```json
{
  "ok": true,
  "items": [
    {
      "cjProductId": "...",
      "title": "...",
      "mainImageUrl": "https://...",
      "listPriceUsd": 4.50,
      "operabilityStatus": "operable"
    }
  ],
  "operabilitySummary": {
    "operable": 12,
    "stockUnknown": 5,
    "unavailable": 3
  }
}
```

### GET /api/cj-ebay/cj/product/:cjProductId

Response:
```json
{
  "ok": true,
  "product": {
    "cjProductId": "...",
    "title": "...",
    "imageUrls": ["https://..."],
    "variants": [
      {
        "cjSku": "...",
        "cjVid": "...",
        "attributes": { "Color": "Black", "Size": "XL" },
        "unitCostUsd": 3.20,
        "stock": 150
      }
    ]
  },
  "liveStockCoverage": {
    "checked": 12,
    "total": 12,
    "complete": true
  }
}
```

---

## 8. Resolución de variantId

El backend (`cj-ebay-variant-resolution.ts`) acepta como `variantId` tanto el `cjVid` como el `cjSku`.

El frontend prioriza `cjVid` cuando está disponible, igual que el backend:
```typescript
function variantKey(v: CjVariantDetail): string {
  return v.cjVid ?? v.cjSku;
}
```

---

## 9. Modelo de datos implicado

Sin cambios en DB. Los endpoints de search y getProduct no persisten nada. La persistencia ocurre únicamente en `runEvaluate()` (→ `POST /evaluate`) como siempre.

Tablas involucradas al evaluar (sin cambios):
- `cj_ebay_products`
- `cj_ebay_product_variants`
- `cj_ebay_shipping_quotes`
- `cj_ebay_product_evaluations`

---

## 10. Convivencia con el modo manual

| Modo | Ubicación | Visibilidad por defecto |
|---|---|---|
| Buscador (nuevo flujo principal) | Secciones A–D (parte superior) | Siempre visible |
| Manual / avanzado | Sección E (parte inferior) | Colapsado |

El modo avanzado no se degrada: cuando el usuario expande el panel, los campos `productId` y `variantId` son los mismos que usa el buscador. Si el usuario busca un producto y luego abre el modo avanzado, verá los IDs ya cargados. Puede editarlos manualmente si necesita.

---

## 11. Criterios de terminado

- [x] Products permite buscar productos CJ por texto
- [x] Muestra resultados reales con imagen, título y precio
- [x] El flujo principal muestra solo productos con stock confirmado
- [x] Los productos con stock incierto o agotado quedan separados en secciones secundarias
- [x] El usuario puede seleccionar un producto con un clic
- [x] Puede seleccionar variante sin escribir IDs manualmente
- [x] El flujo principal solo permite elegir variantes con stock >= 1
- [x] Se rellenan correctamente `productId` y `variantId`
- [x] Vista previa pricing funciona desde este flujo
- [x] Evaluar y persistir funciona desde este flujo
- [x] Crear draft listing funciona desde este flujo
- [x] El modo manual sigue disponible como fallback (Sección E)
- [x] La documentación .md fue creada
- [x] El plan maestro fue actualizado
- [x] Validación con cuenta CJ real en producción ejecutada 2026-04-15: search ✅ · product detail ✅ · preview pricing ✅ · bug imageUrls corregido ✅
- [x] Auditoría stock 2026-04-15: todos los productos mostraban stock 0 — causa raíz identificada y corregida (ver §16)

---

## 12. Criterios de validación

1. Escribir "phone holder" → clic Buscar → `Resultados operables` muestra solo productos con stock confirmado
2. Los resultados con stock incierto o agotado aparecen solo en secciones secundarias
3. Clic en un resultado → aparece Sección C con variantes cargadas y ordenadas por disponibilidad
4. Si hay una sola variante operable: selección automática
5. Si hay múltiples: el bloque `Variantes operables` aparece antes de `Variantes sin stock`
6. Si todas están agotadas: banner amber + flujo principal bloqueado
7. Después de seleccionar variante operable: aparece Sección D con badge verde mostrando IDs
8. "Vista previa pricing" → devuelve breakdown completo
9. "Evaluar y persistir" → devuelve decisión APPROVED/REJECTED/PENDING
10. Si APPROVED, "Crear draft listing" → crea draft y link a Listings
11. Sección E colapsada por defecto, expandible, con campos editables
12. Ninguna otra pantalla del módulo (Listings, Orders, Overview) fue afectada

---

## 13. Riesgos

| Riesgo | Mitigación |
|---|---|
| CJ API devuelve imágenes con URLs inestables | `loading="lazy"` + fallback "Sin imagen" si no hay URL |
| Producto sin variantes (fallback sintético del adapter) | Mensaje amber informativo; usuario puede usar modo avanzado |
| Timeout en búsqueda CJ | Error state claro + botón para reintentar |
| Usuario cambia variante después de evaluar | `chooseVariant()` limpia `preview` y `evaluate` para evitar inconsistencias |
| `aria-expanded` con valor booleano en JSX | Corregido: se usa boolean nativo — React lo serializa como string en el DOM |
| Todos los productos aparecen con stock 0 | Ver §16 — tres causas raíz identificadas y corregidas en backend + frontend |
| `inventoryTotal` ausente en `listV2` | El producto no entra al flujo principal; queda en `Stock por confirmar` hasta revisar detalle |

---

## 14. Plan de implementación (ejecutado)

| Paso | Acción | Estado |
|---|---|---|
| 1 | Auditoría completa del módulo actual | Hecho |
| 2 | Verificar existencia de endpoints backend necesarios | Hecho — todos existían |
| 3 | Diseñar UX y flujo de 5 secciones | Hecho |
| 4 | Reescribir `CjEbayProductsPage.tsx` | Hecho |
| 5 | Crear `docs/CJ_EBAY_USA_PRODUCT_SEARCH_PLAN.md` | Hecho (este archivo) |
| 6 | Actualizar `docs/CJ_EBAY_USA_MASTER_PLAN.md` | Hecho |

---

## 15. Resultado esperado

Un operador sin conocimiento técnico de CJ puede:

1. Abrir Products
2. Escribir lo que busca ("soporte para teléfono")
3. Ver resultados visuales con imagen y precio
4. Clic en el producto que le interesa
5. Ver variantes con atributos legibles, precio unitario y stock
6. Seleccionar la variante
7. Ajustar quantity y postal code si lo desea
8. Ejecutar preview → evaluate → draft
9. Ir a Listings → Publish

Sin copiar un solo ID técnico.

---

## 16. Auditoría de stock — 2026-04-15

### Síntoma
Todos los productos en el buscador y todas las variantes en el picker mostraban `stock: 0`. Se sospechó que podía ser dato real o bug de mapeo.

### Causa raíz (tres problemas independientes)

**Problema 1 — `parseVariantRow` ignoraba aliases de campo**

CJ devuelve el stock de variante bajo distintos nombres según el endpoint:
`storageNum`, `inventoryNum`, `inventory`, `stock`, `quantity`.
El adapter solo leía `storageNum`. Al no encontrarlo, retornaba 0.

Fix: cadena de aliases `storageNum ?? inventoryNum ?? inventory ?? stock ?? quantity ?? 0`.

**Problema 2 — `getStockForSkus` con respuesta array**

`product/stock/queryByVid` a veces devuelve `data` como array, no como objeto.
`asRecord(data)` retorna `null` cuando recibe array → `extractCjStockNum` siempre devolvía 0.

Fix: nuevo helper `extractCjStockNum` que maneja tanto array como objeto, con matching por `vid`.

**Problema 3 — `rowToSummary` no capturaba `inventoryTotal`**

`product/listV2` incluye `inventoryNum` / `inventory` en cada producto del catálogo.
`rowToSummary` no los leía → `inventoryTotal` siempre `undefined` → la UI no podía diferenciar "sin datos" de "en stock".

Fix: extracción explícita de `inventoryNum → inventory → inventoryQuantity → stock` con normalización numérica.

### Cambios implementados

| Archivo | Cambio |
|---|---|
| `cj-supplier.adapter.ts` | `parseVariantRow` aliases, `extractCjStockNum`, `getStockForSkus` try/catch |
| `cj-supplier.adapter.interface.ts` | `inventoryTotal?: number` con JSDoc en `CjProductSummary` |
| `cj-ebay.routes.ts` | Ranking + `operabilityStatus`, `operabilitySummary`, live stock probe en search y detalle |
| `CjEbayProductsPage.tsx` | `StockBadge`, segmentación operable/secundaria, fail-closed de variantes agotadas |
| `CjEbayLayout.tsx` | Remoción del bloque técnico superior del flujo principal |

### UX resultante

- **Sección B (resultados):** la lista principal solo contiene candidatos operables. `Stock por confirmar` y `Sin disponibilidad / no operables` quedan fuera del flujo principal.
- **Sección C (variante picker):** las variantes con stock útil quedan agrupadas arriba y son las únicas seleccionables desde la UI principal.
- **Sección C (agotados):** las variantes con stock 0 siguen visibles, pero degradadas y fuera del flujo principal.
- **Detalle del producto:** la UI deja de confiar en `product/variant/query` cuando ese endpoint trae stock nulo/0 y usa `product/stock/queryByVid` para reconstruir stock live.

---

## 17. Ranking operativo — 2026-04-15 (commit `e9f083f`)

### Objetivo

Ordenar los resultados de búsqueda CJ para que los productos más prometedores para el ciclo `preview → evaluate → draft` aparezcan primero, ahora dentro de una segmentación real por operabilidad y usando probes live acotados cuando el resumen CJ no trae stock útil.

### Señales reales disponibles para ranking

| Señal | Fuente | Fiabilidad | Usado en ranking |
|---|---|---|---|
| `inventoryTotal` | `product/listV2` `inventoryNum/inventory` | Media — muchos productos sin dato | Sí — señal A |
| `listPriceUsd` | `product/listV2` `nowPrice/discountPrice/sellPrice` | Buena cuando presente | Sí — señal B |
| `mainImageUrl` | `product/listV2` `productImage/bigImage` | Alta | Sí — señal C |
| `title` / longitud | `product/listV2` `productNameEn` | Alta | Sí — señal D |
| `cjProductId` | `product/listV2` `pid/id` | Siempre | No — identidad, no ranking |

### Señales descartadas como señal primaria de ranking (siguen siendo caras en búsqueda)

| Señal | Por qué descartada |
|---|---|
| Variant count | Requiere `product/variant/query` — 20 calls para 20 resultados = ~22s de latencia |
| `unitCostUsd` por variante | Ídem — necesita variant detail |
| `cjVid` disponibilidad | Ídem |
| Stock real exhaustivo por variante | Requiere `product/stock/queryByVid` por cada variante |
| Shipping a USA | Requiere `freightCalculate` — call extra prohibitiva en búsqueda |
| Categoría del producto | No expuesta en listV2 |

### Heurística final — `cjSearchRankScore()` (0–100)

```
A. Stock presence     0–45 pts
   inventoryTotal > 0      → 40 pts  (producto activamente reabastecido)
   inventoryTotal ≥ 50     → +5 pts  (profundidad: proveedor confiable)
   inventoryTotal undefined → 20 pts  (neutro — no penalizar dato ausente)
   inventoryTotal = 0       →  0 pts  (probable producto muerto)

B. Price viability    0–30 pts   (margen viable eBay USA: ~16% fees + $3-$8 shipping)
   $1–$25    → 30 pts  sweet spot: precio cubre fees con margen real
   $25–$50   → 20 pts  aceptable pero margen más ajustado
   < $1      →  8 pts  demasiado barato: envío solo > costo producto
   > $50     →  8 pts  capital intensivo, baja rotación eBay
   ausente   → 15 pts  neutro

C. Image present      0–15 pts
   URL http válida   → 15 pts  (requerida para listing eBay)
   ausente           →  0 pts

D. Title depth        0–10 pts
   ≥ 40 chars → 10 pts
   ≥ 20 chars →  6 pts
   ≥ 10 chars →  3 pts
   < 10 chars →  0 pts

Total máximo: 100 (45+30+15+10)
Umbral "Operable": ≥ 70 pts (stock>0 + sweet spot price)
```

### Dónde se implementó

- **Backend** — `cjSearchRankScore()` en `backend/src/modules/cj-ebay/cj-ebay.routes.ts`
- Ejecutado sobre resultados de `product/listV2` antes de devolver respuesta
- El mismo endpoint emite `operabilityStatus` por item y `operabilitySummary` agregada
- Cuando `listV2` no trae stock útil, el backend hace probes live acotados sobre los top resultados usando `product/query` + `product/stock/queryByVid`
- Frontend consume el orden ya calculado

### UX añadida

- El ranking ya no reemplaza al filtro operativo: primero se segmenta por evidencia de stock live (`operable > stock_unknown > unavailable`) y luego se ordena por score dentro de cada bucket.
- El frontend solo usa el bucket `operable` como flujo principal; los demás quedan en secciones secundarias.

### Impacto de performance

El scoring sigue siendo O(n) sobre `product/listV2`, pero ahora la búsqueda puede hacer probes live adicionales sobre un subconjunto pequeño de resultados para confirmar operabilidad. Es un costo deliberado para evitar que el flujo principal siga tratando agotados como candidatos normales.

### Limitaciones conocidas

1. `inventoryTotal` de listV2 puede no estar disponible para todos los productos → el backend hace probes live sobre un subconjunto superior; el resto queda en `Stock por confirmar`.
2. La señal de precio (`listPriceUsd`) puede ser la cota baja de un rango (`"0.55 -- 7.18"` → 0.55) — subestima precio real para algunos productos.
3. No sabemos cuántas variantes tiene el producto ni si tiene `cjVid` hasta cargar detalle — la señal de precio no garantiza que exista una variante con unitCostUsd usable.
4. El ranking no es causal: un producto bien rankeado puede fallar en preview si `unitCostUsd = 0` (error `NO_UNIT_COST`). El ranking maximiza probabilidad pero no la garantiza.
5. El detalle de producto ahora usa stock live por variante, pero productos con muchísimas variantes pueden tardar más en abrir porque el backend valida disponibilidad real antes de presentar la selección operativa.

### Cómo ayuda al operador

Un operador que busca "phone holder" verá primero los productos que:
- Tienen stock confirmado (reduciendo el riesgo de seleccionar algo agotado)
- Tienen precio en el rango operativo ($1–$25)
- Tienen imagen (prerequisito para listing eBay)
- Tienen datos de título completos

Los productos muertos (stock=0, sin imagen, sin precio) ya no compiten como candidatos principales: quedan separados en `Sin disponibilidad / no operables`.

---

## 18. Limpieza UX y filtro operativo real — 2026-04-14

### Limpieza UX

- Se eliminó del layout compartido de CJ/eBay el bloque técnico superior que mostraba mensajes internos del tipo "Vertical aislada", "Operador — dónde seguir", referencias a `BLOCK_NEW_PUBLICATIONS` y rutas `/api/cj-ebay/orders/*`.
- La cabecera del módulo ahora deja solo una descripción corta y orientada al operador.
- La información técnica de Listings/Orders se mantiene en superficies contextuales de esas pantallas, no en Products.

### Criterio de producto operable

- **Producto operable:** el backend logra confirmar `stock >= 1` en al menos una variante usando stock live (`product/stock/queryByVid`) o, si CJ ya entrega inventario útil en `listV2`, con esa señal directa.
- **Producto no operable:** CJ reporta `inventoryTotal = 0` o el producto queda descartado tras validar las variantes disponibles que sí pudieron auditarse.
- **Stock por confirmar:** no hay evidencia suficiente todavía; queda fuera del flujo principal hasta inspección adicional.

### Segmentación actual

- **Resultados operables:** únicos candidatos del flujo principal.
- **Stock por confirmar:** sección secundaria colapsable.
- **Sin disponibilidad / no operables:** sección secundaria colapsable y visualmente degradada.
- **Variantes agotadas:** visibles en detalle, pero fuera del flujo principal y no seleccionables desde la UI principal.

### Impacto UX

- La pantalla Products vuelve a comportarse como flujo operativo: buscar → elegir producto operable → elegir variante operable → preview → evaluate → draft.
- Se reduce el ruido visual y desaparece el copy interno que no aportaba a la tarea del operador.
- Se evita que un producto agotado compita visualmente con uno publicable.

### Limitaciones conocidas

- La segmentación de búsqueda depende de una combinación entre `listV2` y probes live acotados. Si CJ omite stock y el candidato no entra al subconjunto enriquecido, queda temporalmente en `Stock por confirmar`.
- El detalle de producto privilegia precisión sobre velocidad: para reconstruir stock live real, el backend consulta variantes individuales antes de renderizar la selección operativa.
