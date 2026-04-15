# CJ → eBay USA — Plan: Buscador de Productos en Products

**Versión:** 1.0  
**Fecha:** 2026-04-14  
**Autor:** Principal Product Architect + Staff Full-Stack  
**Estado:** Implementado

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
| `aria-expanded` con valor booleano en JSX | Corregido: se usa `advancedOpen ? 'true' : 'false'` para cumplir ARIA spec |

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
