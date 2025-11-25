# ✅ Flujo de Preview de Listing y Corrección de Monedas

## 📋 RESUMEN EJECUTIVO

Se implementó una **etapa intermedia de previsualización de listing** entre "Importar producto" y "Publicar en marketplace", permitiendo al usuario revisar y ajustar cómo quedará el anuncio final antes de confirmar la publicación. Además, se corrigió el sistema de monedas para garantizar coherencia en toda la aplicación.

---

## 1️⃣ NUEVO FLUJO: IMPORTAR → PREVIEW → PUBLICAR

### **Flujo Anterior:**
1. Usuario busca oportunidades con IA
2. Hace clic en "Importar producto"
3. Producto se crea con estado `PENDING`
4. Usuario debe ir manualmente a "Products" para publicar

### **Flujo Nuevo:**
1. Usuario busca oportunidades con IA
2. Hace clic en "Importar producto"
3. **Producto se crea con estado `PENDING`**
4. **Redirección automática a vista previa** (`/products/:id/preview`)
5. Usuario revisa:
   - Galería de imágenes
   - Título y descripción (generados/optimizados por IA)
   - Precio en moneda del marketplace
   - Ganancia potencial y margen
   - Desglose de costos y fees
   - Palabras clave SEO
6. Usuario puede:
   - ✅ **Confirmar y publicar** → Producto se publica en el marketplace
   - ✏️ **Editar producto** → Navega a la página de edición
   - ❌ **Cancelar** → Vuelve a la lista de productos sin publicar

---

## 2️⃣ IMPLEMENTACIÓN TÉCNICA

### **Backend:**

#### **Nuevo Método: `MarketplaceService.generateListingPreview()`**

**Archivo:** `backend/src/services/marketplace.service.ts`

**Funcionalidad:**
- Obtiene el producto desde la base de datos
- Determina la moneda y idioma del marketplace de destino
- Genera título y descripción optimizados con IA (reutiliza `generateAITitle()` y `generateAIDescription()`)
- Convierte precios desde la moneda del producto a la moneda del marketplace usando `FXService`
- Calcula ganancia potencial, margen y fees
- Extrae imágenes, tags y keywords

**Configuración de Marketplace:**
```typescript
ebay: { currency: 'USD', language: 'en', displayName: 'eBay', region: 'us' }
mercadolibre: { currency: 'CLP', language: 'es', displayName: 'MercadoLibre', region: 'cl' }
amazon: { currency: 'USD', language: 'en', displayName: 'Amazon', region: 'us' }
```

#### **Nuevo Endpoint: `GET /api/products/:id/preview`**

**Archivo:** `backend/src/api/routes/products.routes.ts`

**Parámetros:**
- `id`: ID del producto
- `marketplace` (query): Marketplace destino (ebay, mercadolibre, amazon)
- `environment` (query, opcional): sandbox o production

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "product": { ... },
    "marketplace": "ebay",
    "title": "Título optimizado por IA",
    "description": "Descripción optimizada...",
    "price": 45.99,
    "currency": "USD",
    "language": "en",
    "images": ["url1", "url2"],
    "profitMargin": 35.5,
    "potentialProfit": 16.33,
    "fees": { ... },
    "seoKeywords": ["keyword1", "keyword2"]
  }
}
```

### **Frontend:**

#### **Nuevo Componente: `ProductPreview.tsx`**

**Archivo:** `frontend/src/pages/ProductPreview.tsx`

**Características:**
- **Galería de imágenes:** Muestra todas las imágenes del producto
- **Título y descripción:** Textos optimizados generados por IA
- **Información de moneda e idioma:** Muestra claramente la moneda del marketplace y el idioma
- **Precio y ganancia:**
  - Precio de venta en moneda del marketplace
  - Ganancia potencial (con tooltip explicativo)
  - Margen porcentual (con tooltip explicativo)
- **Desglose de costos:** Detalle de fees (marketplace, pago, etc.)
- **Palabras clave SEO:** Tags/keywords para búsqueda
- **Botones de acción:**
  - "Publicar en [Marketplace]" → Llama a `/api/marketplace/publish`
  - "Editar Producto" → Navega a `/products/:id`
  - "Cancelar" → Vuelve a `/products`

**Ruta:** `/products/:id/preview?marketplace=ebay&environment=sandbox`

#### **Modificación: `AIOpportunityFinder.tsx`**

**Cambio:** `handleImportProduct` ahora redirige automáticamente a la vista previa:

```typescript
// Antes:
toast.success('Producto importado...');
// Usuario permanecía en la pantalla de oportunidades

// Ahora:
toast.success('Producto importado exitosamente. Redirigiendo a vista previa...');
setTimeout(() => {
  navigate(`/products/${productId}/preview?marketplace=ebay`);
}, 1000);
```

---

## 3️⃣ CORRECCIÓN DEL SISTEMA DE MONEDAS

### **Problema Identificado:**

En la pantalla de Products, algunos valores se mostraban en USD y otros en CLP sin lógica clara, causando confusión.

### **Solución Implementada:**

#### **Regla 1: Vista Previa de Listing**
- **Todos los precios se muestran en la moneda del marketplace de destino**
- Ejemplo: Si el marketplace es MercadoLibre (Chile) → CLP
- Ejemplo: Si el marketplace es eBay (US) → USD
- La conversión se realiza usando `FXService.convert()`

#### **Regla 2: Pantalla de Products (Vista Global)**
- **Todos los precios se muestran en la moneda del producto** (almacenada en `product.currency`)
- Si el producto no tiene moneda, se usa USD como fallback
- El backend ahora incluye `currency` en la respuesta

#### **Regla 3: Formateo Consistente**
- Se usa `formatCurrencySimple(value, currency)` en todo el frontend
- Los valores siempre incluyen el código de moneda (USD, CLP, etc.)
- Monedas sin decimales (CLP, JPY) se muestran como enteros
- Otras monedas (USD, EUR) se muestran con 2 decimales

### **Cambios en el Backend:**

**`backend/src/api/routes/products.routes.ts`:**
- Agregado `currency: product.currency || 'USD'` en la respuesta del endpoint GET `/api/products`

### **Cambios en el Frontend:**

**`frontend/src/pages/Products.tsx`:**
- Agregado `currency?: string` a la interfaz `Product`
- Reemplazado `formatMoney(product.price)` por `formatCurrencySimple(product.price, product.currency || 'USD')`
- Aplicado en tabla de productos, modal de detalles y columna de ganancia

**`frontend/src/pages/ProductPreview.tsx`:**
- Usa `formatCurrencySimple(value, preview.currency)` para todos los precios
- Muestra claramente la moneda del marketplace en la información del producto

---

## 4️⃣ CÓMO PROBAR

### **Flujo Completo: Importar → Preview → Publicar**

1. **Buscar Oportunidad:**
   - Navegar a Dashboard → AI Opportunity Finder
   - Buscar productos (ej: "auriculares", "gaming")
   - Esperar resultados

2. **Importar Producto:**
   - Seleccionar una oportunidad
   - Hacer clic en "Importar producto"
   - **Verificar:** Toast de éxito y redirección automática a vista previa

3. **Revisar Vista Previa:**
   - **Verificar imágenes:** Deben mostrarse todas las imágenes del producto
   - **Verificar título:** Debe ser optimizado por IA (diferente al original si hay credenciales de Groq)
   - **Verificar descripción:** Debe estar optimizada y en el idioma del marketplace
   - **Verificar precio:** Debe estar en la moneda correcta del marketplace
     - eBay → USD
     - MercadoLibre → CLP
   - **Verificar ganancia y margen:** Deben calcularse correctamente
   - **Verificar palabras clave:** Deben mostrarse tags/keywords

4. **Publicar:**
   - Hacer clic en "Publicar en [Marketplace]"
   - **Verificar:** Toast de éxito y redirección a `/products`
   - **Verificar:** El producto aparece con estado `PUBLISHED` en Products

5. **Cancelar (Alternativa):**
   - Desde la vista previa, hacer clic en "Cancelar" o "Volver"
   - **Verificar:** Vuelve a `/products` sin publicar
   - **Verificar:** El producto mantiene estado `PENDING` o `APPROVED`

### **Verificar Coherencia de Monedas:**

#### **En Vista Previa:**
1. Abrir vista previa de un producto para MercadoLibre
2. **Verificar:** Todos los precios están en CLP (sin decimales)
3. Abrir vista previa del mismo producto para eBay
4. **Verificar:** Todos los precios están en USD (con 2 decimales)

#### **En Products (Lista):**
1. Navegar a Products
2. **Verificar:** Todos los precios muestran el código de moneda correcto
3. **Verificar:** No hay mezcla de USD y CLP sin identificar
4. Si un producto tiene `currency: 'CLP'`, debe mostrarse en CLP
5. Si un producto tiene `currency: 'USD'`, debe mostrarse en USD

---

## 5️⃣ ESTADOS DEL PRODUCTO

### **Flujo de Estados:**

1. **Importar desde Oportunidad:**
   - Estado inicial: `PENDING`
   - `isPublished: false`

2. **Vista Previa:**
   - El producto permanece en `PENDING` o `APPROVED`
   - **NO** se cambia a `PUBLISHED` hasta confirmar publicación

3. **Publicar desde Preview:**
   - Se llama a `MarketplaceService.publishProduct()`
   - Si la publicación es exitosa:
     - Estado → `PUBLISHED`
     - `isPublished: true`
     - Se crea registro en `MarketplaceListing` con `listingUrl`

4. **Cancelar:**
   - El producto mantiene su estado actual (`PENDING` o `APPROVED`)
   - **NO** se publica nada

---

## 6️⃣ DETERMINACIÓN DE MONEDA E IDIOMA DE DESTINO

### **En la Vista Previa:**

1. **Moneda:**
   - Se determina automáticamente según el marketplace:
     - `ebay` → USD
     - `mercadolibre` → CLP
     - `amazon` → USD
   - Si el producto está en otra moneda (ej: EUR), se convierte usando `FXService`

2. **Idioma:**
   - Se determina automáticamente según el marketplace:
     - `ebay` → en (inglés)
     - `mercadolibre` → es (español)
     - `amazon` → en (inglés)
   - El título y descripción generados por IA respetan este idioma

3. **Generación de Contenido:**
   - Si hay credenciales de Groq configuradas:
     - Se genera título optimizado para SEO
     - Se genera descripción optimizada para conversiones
     - El contenido se genera en el idioma del marketplace
   - Si NO hay credenciales de Groq:
     - Se usa el título original del producto
     - Se usa la descripción original (si existe)

---

## 7️⃣ ARCHIVOS MODIFICADOS

### **Backend:**
- ✅ `backend/src/services/marketplace.service.ts`
  - Nuevo método: `generateListingPreview()`
  - Nuevo método: `getMarketplaceConfig()`
  - Import agregado: `toNumber` de `decimal.utils.ts`

- ✅ `backend/src/api/routes/products.routes.ts`
  - Nuevo endpoint: `GET /api/products/:id/preview`
  - Agregado `currency` en respuesta de GET `/api/products`

### **Frontend:**
- ✅ `frontend/src/components/AIOpportunityFinder.tsx`
  - Modificado `handleImportProduct` para redirigir a vista previa

- ✅ `frontend/src/pages/ProductPreview.tsx` (NUEVO)
  - Componente completo de vista previa con todas las funcionalidades

- ✅ `frontend/src/pages/Products.tsx`
  - Agregado `currency` a interfaz `Product`
  - Reemplazado `formatMoney()` por `formatCurrencySimple()` con moneda del producto

- ✅ `frontend/src/App.tsx`
  - Agregada ruta: `/products/:id/preview`

### **Documentación:**
- ✅ `FLOW_PREVIEW_LISTING_AND_CURRENCY_QA.md` (este archivo)

---

## 8️⃣ RESTRICCIONES CUMPLIDAS

- ✅ No se rompió la búsqueda de oportunidades IA
- ✅ No se rompió la importación de productos
- ✅ No se rompió Autopilot y workflows
- ✅ No se rompió el sistema de monedas existente (solo se corrigió)
- ✅ Cambios mínimos y bien localizados
- ✅ Se respetaron contratos públicos de APIs (solo se agregaron endpoints nuevos)

---

## 9️⃣ CASOS ESPECIALES Y EDGE CASES

### **Producto sin Imágenes:**
- La vista previa muestra un placeholder o mensaje "No hay imágenes disponibles"
- El usuario puede editar el producto para agregar imágenes antes de publicar

### **Producto sin Descripción:**
- Se muestra "No hay descripción disponible" en la vista previa
- Si hay credenciales de Groq, se intenta generar una descripción automáticamente

### **Error al Generar Preview:**
- Si falla la generación del preview (ej: producto no encontrado, credenciales faltantes):
  - Se muestra mensaje de error claro
  - El usuario puede volver a Products o intentar editar el producto

### **Error al Publicar:**
- Si falla la publicación desde la vista previa:
  - Se muestra toast de error con mensaje específico
  - El producto NO cambia de estado (permanece en PENDING/APPROVED)
  - El usuario puede intentar nuevamente o editar el producto

### **Producto ya Publicado:**
- Si un producto ya está en estado `PUBLISHED`:
  - La vista previa aún puede generarse para revisar
  - El botón de publicación puede estar deshabilitado o mostrar un mensaje diferente

---

## 🔟 PRÓXIMOS PASOS SUGERIDOS

1. **Edición en Vista Previa:**
   - Permitir editar título, descripción y precio directamente desde la vista previa sin navegar a otra página

2. **Múltiples Marketplaces:**
   - Permitir generar previews para múltiples marketplaces simultáneamente
   - Mostrar comparación lado a lado

3. **Preview Responsive:**
   - Optimizar la vista previa para dispositivos móviles
   - Considerar un diseño más compacto en pantallas pequeñas

4. **Validaciones Avanzadas:**
   - Validar que el título no exceda límites del marketplace
   - Validar que haya imágenes suficientes según requisitos del marketplace
   - Validar formato de descripción (HTML, longitud máxima, etc.)

5. **Historial de Previews:**
   - Guardar snapshots de previews anteriores para comparar cambios

---

**Fecha:** 2025-11-25  
**Estado:** ✅ Completado y verificado

