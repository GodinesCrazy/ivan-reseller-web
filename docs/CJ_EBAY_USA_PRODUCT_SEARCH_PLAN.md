# CJ → eBay USA — Plan: Buscador de Productos en Products

**Versión:** 1.2  
**Fecha:** 2026-04-14 / actualizado 2026-04-15  
**Autor:** Principal Product Architect + Staff Full-Stack  
**Estado:** Implementado — ranking operativo activo (§17)

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
Grid responsive (1→2→3→4 columnas según viewport).  
Cada card muestra:
- Imagen del producto (aspect-square, object-contain)
- Título (line-clamp-2)
- Precio base si disponible (`listPriceUsd`)
- Botón "Seleccionar" integrado en la card
- Highlight visual cuando la card está seleccionada

### Sección C — Producto seleccionado
Al hacer clic en una card:
- Se llama `GET /api/cj-ebay/cj/product/:cjProductId`
- Se muestra imagen principal + título + productId técnico + número de variantes
- **Si hay 1 variante:** se selecciona automáticamente y se muestra badge de confirmación verde
- **Si hay N variantes:** se muestra un grid de botones con label de atributos (Color/Size/etc.), precio unitario y stock por variante
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

No se requirió ningún cambio backend. Los endpoints necesarios ya existían:

| Endpoint | Uso |
|---|---|
| `POST /api/cj-ebay/cj/search` | Búsqueda textual en catálogo CJ |
| `GET /api/cj-ebay/cj/product/:cjProductId` | Detalle del producto + variantes |
| `POST /api/cj-ebay/pricing/preview` | Preview pricing sin persistir |
| `POST /api/cj-ebay/evaluate` | Evaluación + persistencia en BD |
| `POST /api/cj-ebay/listings/draft` | Crear draft listing |

---

## 6. Arquitectura frontend

### Archivo modificado
`frontend/src/pages/cj-ebay/CjEbayProductsPage.tsx`

### Nuevos tipos añadidos al archivo
```typescript
type CjProductSummary = {
  cjProductId: string;
  title: string;
  mainImageUrl?: string;
  listPriceUsd?: number;
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
- `selectProduct(summary)` — GET /cj/product/:id, auto-selecciona variante única
- `chooseVariant(vk)` — actualiza variantId + resetea resultados previos del pipeline

### Funciones conservadas intactas
- `runPreview()`, `runEvaluate()`, `runDraft()`
- Helper `body()` — mismo shape de request

### Utilidades nuevas
- `variantLabel(v)` — formatea atributos como "Color: Red · Size: XL"
- `variantKey(v)` — devuelve `cjVid ?? cjSku` (misma lógica que el backend)
- `extractApiError(e, fallback)` — extrae mensaje de error de AxiosError o Error nativo

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
      "listPriceUsd": 4.50
    }
  ]
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
- [x] El usuario puede seleccionar un producto con un clic
- [x] Puede seleccionar variante sin escribir IDs manualmente
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

1. Escribir "phone holder" → clic Buscar → aparece grid de resultados reales CJ
2. Clic en un resultado → aparece Sección C con variantes cargadas
3. Si hay una sola variante: badge verde "Variante única seleccionada automáticamente"
4. Si hay múltiples: picker con atributos, precios y stock por variante
5. Después de seleccionar variante: aparece Sección D con badge verde mostrando IDs
6. "Vista previa pricing" → devuelve breakdown completo
7. "Evaluar y persistir" → devuelve decisión APPROVED/REJECTED/PENDING
8. Si APPROVED, "Crear draft listing" → crea draft y link a Listings
9. Sección E colapsada por defecto, expandible, con campos editables
10. Ninguna otra pantalla del módulo (Listings, Orders, Overview) fue afectada

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
| `cj-ebay.routes.ts` | Sort por stock, campo `stockCoverage` en respuesta de search |
| `CjEbayProductsPage.tsx` | `StockBadge`, `hasKnownStock`, cards dimmed, variant picker con stock labels y warning |

### UX resultante

- **Sección B (resultados):** cards con stock conocido y positivo muestran badge verde "En stock (N)"; sin stock conocido muestran badge amber; sin datos no muestran badge. Resultados con stock > 0 aparecen primero.
- **Sección C (variante picker):** cada variante muestra label de color: emerald "N en stock" o amber "Sin stock". Variantes con stock 0 quedan dimmed pero seleccionables. Si todas las variantes tienen stock 0, aparece banner de advertencia.
- **Sección C (variante única):** badge verde cuando stock > 0, amber cuando stock = 0.

---

## 17. Ranking operativo — 2026-04-15 (commit `e9f083f`)

### Objetivo

Ordenar los resultados de búsqueda CJ para que los productos más prometedores para el ciclo `preview → evaluate → draft` aparezcan primero, sin eliminar resultados y sin llamadas extra a la API CJ.

### Señales reales disponibles para ranking

| Señal | Fuente | Fiabilidad | Usado en ranking |
|---|---|---|---|
| `inventoryTotal` | `product/listV2` `inventoryNum/inventory` | Media — muchos productos sin dato | Sí — señal A |
| `listPriceUsd` | `product/listV2` `nowPrice/discountPrice/sellPrice` | Buena cuando presente | Sí — señal B |
| `mainImageUrl` | `product/listV2` `productImage/bigImage` | Alta | Sí — señal C |
| `title` / longitud | `product/listV2` `productNameEn` | Alta | Sí — señal D |
| `cjProductId` | `product/listV2` `pid/id` | Siempre | No — identidad, no ranking |

### Señales descartadas (no disponibles en listV2 sin calls extra)

| Señal | Por qué descartada |
|---|---|
| Variant count | Requiere `product/variant/query` — 20 calls para 20 resultados = ~22s de latencia |
| `unitCostUsd` por variante | Ídem — necesita variant detail |
| `cjVid` disponibilidad | Ídem |
| Stock real por variante | Requiere `product/stock/queryByVid` por cada variante |
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
- **Cero calls extra** a CJ API (sin impacto en latencia)
- Frontend consume el orden ya calculado

### UX añadida

- Badge **"Operable"** (azul) en cards donde `isTopCandidate() === true`:
  `inventoryTotal > 0 AND listPriceUsd >= 1 AND listPriceUsd <= 25`
- Función `isTopCandidate()` en frontend refleja el umbral del tier superior del ranking
- Cards siguen siendo todas visibles y seleccionables (no hay exclusión)

### Impacto de performance

Ninguno. Todo el scoring ocurre sobre datos ya obtenidos de `product/listV2`.
La función `cjSearchRankScore()` es O(n) sobre el array de resultados (n ≤ pageSize, default 20).

### Limitaciones conocidas

1. `inventoryTotal` de listV2 puede no estar disponible para todos los productos → ~30-50% de items pueden tener `undefined` → van al tier de 20 pts (neutro, no penalizados).
2. La señal de precio (`listPriceUsd`) puede ser la cota baja de un rango (`"0.55 -- 7.18"` → 0.55) — subestima precio real para algunos productos.
3. No sabemos cuántas variantes tiene el producto ni si tiene `cjVid` hasta cargar detalle — la señal de precio no garantiza que exista una variante con unitCostUsd usable.
4. El ranking no es causal: un producto bien rankeado puede fallar en preview si `unitCostUsd = 0` (error `NO_UNIT_COST`). El ranking maximiza probabilidad pero no la garantiza.

### Cómo ayuda al operador

Un operador que busca "phone holder" verá primero los productos que:
- Tienen stock confirmado (reduciendo el riesgo de seleccionar algo agotado)
- Tienen precio en el rango operativo ($1–$25)
- Tienen imagen (prerequisito para listing eBay)
- Tienen datos de título completos

Los productos muertos (stock=0, sin imagen, sin precio) quedan al fondo sin ser eliminados — el operador puede acceder a ellos si los necesita.
