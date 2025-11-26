# Documentación: Sugerencias IA y Workflow de Oportunidades

**Fecha:** 2025-01-28  
**Versión:** 2.0  
**Estado:** ✅ Implementado y Funcional

---

## 📋 Índice

1. [Sugerencias IA Basadas en Tendencias](#sugerencias-ia-basadas-en-tendencias)
2. [Workflow Manual Completo](#workflow-manual-completo)
3. [Manejo de Errores](#manejo-de-errores)
4. [Preview Multi-Imagen](#preview-multi-imagen)
5. [Edición de Productos](#edición-de-productos)

---

## 🎯 Sugerencias IA Basadas en Tendencias

### Descripción

El sistema ahora genera sugerencias de **keywords de búsqueda** específicas basadas en tendencias reales del sistema, en lugar de sugerencias genéricas.

### Cómo Funciona

#### 1. Análisis de Tendencias

El servicio `TrendSuggestionsService` analiza:
- **Oportunidades recientes** (últimos 30 días por defecto)
- **Productos importados** del usuario
- **Patrones de keywords** extraídos de títulos de productos
- **Métricas de rendimiento**: margen promedio, ROI, confianza, tendencias temporales

#### 2. Extracción de Keywords

El sistema extrae keywords relevantes de los títulos de productos:
- **Palabras individuales** (mínimo 4 caracteres)
- **Bigramas** (2 palabras)
- **Trigramas** (3 palabras, máximo 50 caracteres)
- Filtra stop words comunes (the, and, para, con, etc.)

#### 3. Generación de Sugerencias

Cada sugerencia incluye:
- **Keyword sugerida**: ej. "wireless earbuds", "gaming keyboard"
- **Categoría**: Electrónica, Audio, Hogar, Moda, Juguetes, General
- **Segmento**: Gaming & Esports, Audio & Sound, Home & Kitchen, etc.
- **Razón**: Explicación clara del por qué se sugiere
- **Métrica de soporte**: 
  - Tipo: `demand`, `margin`, `roi`, `competition`, `trend`
  - Valor y descripción
- **Marketplaces objetivo**: eBay, Amazon, MercadoLibre
- **Oportunidades estimadas**: Número aproximado de resultados esperados
- **Confianza**: Porcentaje de confianza (0-100%)
- **Prioridad**: `high`, `medium`, `low`

### Uso en la UI

#### Dashboard → Sugerencias IA

1. **Ver sugerencias existentes**:
   - Las sugerencias se cargan automáticamente al abrir la pestaña
   - Se muestran tarjetas con información completa

2. **Generar nuevas sugerencias**:
   - Clic en botón **"Nueva sugerencia"**
   - El sistema analiza tendencias y genera 5-10 keywords nuevas
   - Las nuevas sugerencias se agregan a la lista

3. **Filtrar sugerencias**:
   - Filtros disponibles: `Todas`, `Búsquedas`, `Pricing`, `Inventory`, `Marketing`, `Listing`, `Optimization`, `Automation`
   - El filtro "Búsquedas" muestra solo sugerencias de keywords

4. **Buscar oportunidades desde sugerencia**:
   - En tarjetas de tipo "search", aparece un botón **"Buscar oportunidades con esta keyword"**
   - Al hacer clic, navega a `/opportunities` con:
     - Campo de keyword pre-llenado
     - Marketplaces preseleccionados según la sugerencia

### Endpoints

#### GET `/api/ai-suggestions`
Obtiene todas las sugerencias del usuario (incluye keywords).

#### POST `/api/ai-suggestions/generate`
Genera nuevas sugerencias (incluye análisis de tendencias y keywords).

#### GET `/api/ai-suggestions/keywords`
Genera solo sugerencias de keywords (5-10 keywords basadas en tendencias).

**Ejemplo de respuesta:**
```json
{
  "success": true,
  "suggestions": [
    {
      "id": "keyword_1234567890_0",
      "type": "search",
      "keyword": "wireless earbuds",
      "category": "Electrónica",
      "segment": "Audio & Sound",
      "reason": "Tendencia creciente: 35% más oportunidades en las últimas semanas. Alto margen promedio: 42%",
      "supportingMetric": {
        "type": "trend",
        "value": 35,
        "unit": "%",
        "description": "Crecimiento de 35% en oportunidades recientes"
      },
      "targetMarketplaces": ["ebay", "amazon"],
      "estimatedOpportunities": 15,
      "confidence": 75,
      "priority": "high"
    }
  ],
  "count": 1
}
```

### Fallback

Si no hay suficientes datos para analizar tendencias, el sistema genera sugerencias de fallback basadas en:
- Categorías populares generales
- Keywords comunes del mercado
- Análisis de productos importados del usuario

---

## 🔄 Workflow Manual Completo

### Flujo Paso a Paso

#### 1. Buscar Oportunidades

**Ruta:** `/opportunities`

**Opciones:**
- **Búsqueda manual**: Ingresar keyword en el campo de búsqueda
- **Desde Sugerencias IA**: Clic en "Buscar oportunidades con esta keyword" desde una sugerencia

**Filtros disponibles:**
- **Keyword**: Término de búsqueda (ej: "organizador cocina")
- **Región**: US, UK, MX, DE, ES, BR
- **Max Items**: 1-10 resultados
- **Marketplaces**: eBay, Amazon, MercadoLibre (checkboxes)

**Acción:** Clic en botón "Search"

**Resultado:** Lista de oportunidades con:
- Imagen del producto
- Título
- Costo (USD y moneda original)
- Precio sugerido
- Margen %
- ROI %
- Nivel de competencia
- Marketplaces objetivo
- Botones de acción (Crear y publicar)

#### 2. Importar Oportunidad

**Desde `/opportunities`:**

1. Seleccionar marketplace objetivo (eBay, Amazon, MercadoLibre)
2. Clic en botón del marketplace (ej: "eBay")
3. El sistema:
   - Crea un producto en la BD con estado `PENDING`
   - Intenta publicar automáticamente en el marketplace seleccionado
   - Si la publicación es exitosa, el producto queda en estado `PUBLISHED`

**Datos guardados:**
- Título, descripción, precio
- URL de AliExpress
- **Todas las imágenes disponibles** (array completo)
- Categoría, tags, metadata

#### 3. Ver Producto en Products Management

**Ruta:** `/products`

**Lista de productos:**
- Estado: PENDING, APPROVED, PUBLISHED, REJECTED
- Información básica: título, SKU, precio, stock, profit
- Acciones: View Detail (ojo), Approve, Reject, Publish, Delete

#### 4. Ver Vista Previa (View Detail)

**Acción:** Clic en ícono de **ojo** (View Detail)

**Navegación:** `/products/:id/preview`

**Vista previa muestra:**
- **Galería completa de imágenes**:
  - Imagen principal grande
  - Navegación con flechas (si hay múltiples imágenes)
  - Thumbnails debajo (si hay más de 1 imagen)
  - Contador de imágenes (ej: "3 / 12")
- **Título y descripción** (en idioma de destino)
- **Precio** (convertido a moneda del marketplace)
- **Desglose de costos**:
  - Costo AliExpress
  - Comisiones marketplace
  - Comisiones de pago
  - Ganancia neta
- **Métricas**:
  - Ganancia potencial
  - Margen %
- **Palabras clave SEO** (si están disponibles)

**Botones disponibles:**
- **Publicar en [marketplace]**: Publica el producto
- **Editar Producto**: Abre modal de edición
- **Cancelar**: Vuelve a `/products`

#### 5. Editar Producto (Antes de Publicar)

**Acción:** Clic en **"Editar Producto"** en la vista previa

**Modal de edición permite:**
- **Título**: Editar texto
- **Descripción**: Editar texto (textarea)
- **Precio**: Editar número (con validación)

**Validaciones:**
- Título no puede estar vacío
- Precio debe ser positivo
- Descripción opcional

**Al guardar:**
- Actualiza el producto en la BD
- **NO publica automáticamente**
- Recarga la vista previa para reflejar cambios
- Muestra toast de éxito

#### 6. Publicar Producto

**Acción:** Clic en **"Publicar en [marketplace]"** en la vista previa

**El sistema:**
1. Valida credenciales del marketplace
2. Prepara payload con:
   - **Todas las imágenes disponibles** (hasta límite del marketplace)
   - Título y descripción editados
   - Precio actualizado
   - Categoría, tags, SEO keywords
3. Publica en el marketplace
4. Actualiza estado del producto a `PUBLISHED`
5. Guarda URL del listing en `marketplaceUrl`
6. Redirige a `/products`

**Límites de imágenes por marketplace:**
- **eBay**: 12 imágenes máximo
- **MercadoLibre**: 10 imágenes máximo
- **Amazon**: 9 imágenes máximo

---

## ⚠️ Manejo de Errores

### Network Error en `/opportunities`

**Problema anterior:**
- El endpoint `/api/credentials/status` fallaba y bloqueaba toda la página
- Se mostraba toast de error que impedía usar la página

**Solución implementada:**

#### Backend (`/api/credentials/status`):
- Manejo de errores individual por proveedor
- Si un proveedor falla, se continúa con los demás
- Retorna respuesta estructurada incluso con errores parciales
- Incluye campo `warnings` para informar problemas sin bloquear

#### Frontend (`Opportunities.tsx`):
- No muestra toast de error que bloquee la página
- Usa estado vacío si falla la carga de credenciales
- Permite continuar usando la página aunque algunas credenciales fallen
- Loguea errores en consola para debugging

**Estructura de respuesta del backend:**
```json
{
  "success": true,
  "data": {
    "apis": [
      {
        "apiName": "ebay",
        "environment": "production",
        "isConfigured": true,
        "isAvailable": true,
        "message": "Credenciales válidas"
      }
    ],
    "summary": {
      "total": 3,
      "configured": 2,
      "available": 1,
      "missing": 1
    },
    "warnings": ["No se pudieron cargar todos los estados de credenciales."]
  }
}
```

### Errores de Credenciales por Marketplace

**Comportamiento:**
- Si un marketplace no tiene credenciales, se muestra mensaje específico
- El usuario puede continuar usando otros marketplaces
- No se bloquea la búsqueda de oportunidades

**Mensajes de error claros:**
- "No hay credenciales listas para [marketplace]"
- Detalles por entorno (sandbox/production)
- Instrucciones para configurar credenciales

---

## 🖼️ Preview Multi-Imagen

### Implementación

**Componente:** `ImageGallery` en `ProductPreview.tsx`

**Características:**
- Muestra **TODAS las imágenes** disponibles del producto
- Carrusel con navegación:
  - Flechas izquierda/derecha (hover para mostrar)
  - Contador de imágenes (ej: "3 / 12")
  - Thumbnails debajo (grid responsive)
- Imagen principal en tamaño grande
- Manejo de errores: placeholder si imagen falla

**Datos:**
- Las imágenes vienen del campo `images` del producto (JSON string)
- El endpoint `/api/products/:id/preview` usa `parseImageUrls()` para extraer todas las URLs
- Se respetan límites del marketplace al publicar, pero en preview se muestran todas

### Verificación

✅ El componente `ImageGallery` recibe `preview.images` (array completo)  
✅ El endpoint `generateListingPreview` usa `parseImageUrls(product.images)`  
✅ La preview muestra todas las imágenes disponibles  
✅ Al publicar, se envían todas las imágenes (hasta límite del marketplace)

---

## ✏️ Edición de Productos

### Funcionalidad

**Ubicación:** Vista previa (`/products/:id/preview`)

**Botón:** "Editar Producto" (icono de lápiz)

**Modal de edición:**
- Campos editables:
  - **Título** (input text)
  - **Descripción** (textarea, 8 filas)
  - **Precio** (input number, step 0.01)
- Validaciones:
  - Título requerido (no vacío)
  - Precio positivo
- Botones:
  - **Cancelar**: Cierra modal sin guardar
  - **Guardar Cambios**: Guarda y recarga preview

**Comportamiento:**
- Al guardar, actualiza el producto en BD
- Recarga la vista previa automáticamente
- **NO publica automáticamente** - la publicación sigue siendo un paso explícito
- Muestra loading state durante el guardado

**Endpoint usado:**
- `PUT /api/products/:id` con payload:
  ```json
  {
    "title": "...",
    "description": "...",
    "suggestedPrice": 99.99,
    "finalPrice": 99.99
  }
  ```

---

## 🔍 Flujo E2E Completo

### Escenario: Usuario busca y publica un producto

1. **Dashboard → Sugerencias IA**
   - Usuario ve sugerencia: "Buscar oportunidades: 'wireless earbuds'"
   - Clic en "Buscar oportunidades con esta keyword"

2. **Navegación a `/opportunities`**
   - Campo de keyword pre-llenado: "wireless earbuds"
   - Marketplaces preseleccionados: eBay, Amazon
   - Búsqueda automática ejecutada

3. **Resultados de búsqueda**
   - Lista de oportunidades con métricas
   - Usuario selecciona una oportunidad
   - Clic en botón "eBay" para importar y publicar

4. **Producto creado**
   - Estado: `PENDING` o `PUBLISHED` (según resultado de publicación)
   - Aparece en `/products`

5. **Ver detalle**
   - Clic en ícono de ojo
   - Navega a `/products/:id/preview`
   - Ve galería completa de imágenes
   - Ve título, descripción, precio, métricas

6. **Editar (opcional)**
   - Clic en "Editar Producto"
   - Modifica título, descripción, precio
   - Guarda cambios
   - Preview se actualiza automáticamente

7. **Publicar (si no se publicó antes)**
   - Clic en "Publicar en eBay"
   - Sistema publica con todas las imágenes
   - Estado cambia a `PUBLISHED`
   - Botón "View on Marketplace" disponible

---

## 📊 KPIs y Métricas

### Formato de Números

**Problema anterior:**
- Números sin formato (ej: `$08040500100606098601!`)

**Solución:**
- Formateo correcto con separadores de miles
- Abreviación para números grandes:
  - > 1M: muestra "X.XM"
  - > 1K: muestra "X.XK"
  - < 1K: muestra número completo con separadores

**Ejemplos:**
- `1234567` → `$1.2M`
- `5432` → `$5.4K`
- `123` → `$123`

---

## 🐛 Errores Conocidos y Soluciones

### Error: "Network Error" en `/opportunities`

**Causa:** Endpoint `/api/credentials/status` falla

**Solución:**
- El backend ahora maneja errores sin bloquear
- El frontend continúa funcionando aunque algunas credenciales fallen
- Verifica credenciales en Settings → API Settings

### Error: "No se pudieron cargar los estados de credenciales"

**Causa:** Problema de conexión o credenciales no configuradas

**Solución:**
- Verifica tu conexión a internet
- Revisa credenciales en Settings → API Settings
- La página continúa funcionando, solo algunas funcionalidades pueden estar limitadas

### Error: Preview no muestra imágenes

**Causa:** Producto no tiene imágenes o formato incorrecto

**Solución:**
- Verifica que el producto tenga imágenes en el campo `images` (JSON array)
- Revisa que las URLs de imágenes sean válidas
- El sistema muestra placeholder si no hay imágenes

### Error: Botón "Editar Producto" no funciona

**Causa:** Modal no se abre o hay error de validación

**Solución:**
- Verifica que el producto tenga datos válidos
- Revisa la consola del navegador para errores
- Asegúrate de que el título no esté vacío y el precio sea positivo

---

## 🧪 Testing

### Tests Recomendados

1. **Generación de sugerencias de keywords:**
   - Verificar que se generan keywords basadas en tendencias
   - Verificar que se incluyen métricas de soporte
   - Verificar fallback cuando no hay datos

2. **Endpoint de credenciales:**
   - Verificar que maneja errores sin bloquear
   - Verificar respuesta estructurada con warnings

3. **Preview multi-imagen:**
   - Verificar que muestra todas las imágenes
   - Verificar navegación del carrusel
   - Verificar thumbnails

4. **Edición de productos:**
   - Verificar que guarda cambios correctamente
   - Verificar que recarga preview después de guardar
   - Verificar validaciones

5. **Flujo E2E:**
   - Sugerencia → /opportunities → importar → products → preview → editar → publicar

---

## 📝 Notas Técnicas

### Servicios Clave

- **`TrendSuggestionsService`**: Analiza tendencias y genera keywords
- **`AISuggestionsService`**: Genera sugerencias generales (incluye keywords)
- **`MarketplaceService.generateListingPreview()`**: Genera preview con todas las imágenes
- **`ProductService`**: Maneja CRUD de productos

### Estructura de Datos

**Product.images:**
- Tipo: `String` (JSON string)
- Formato: `["url1", "url2", "url3"]`
- Se parsea con `parseImageUrls()` para obtener array

**KeywordSuggestion:**
- Interfaz completa en `trend-suggestions.service.ts`
- Incluye keyword, categoría, razón, métricas, marketplaces

### Límites

- **Keywords por sugerencia**: 5-10
- **Imágenes en preview**: Todas las disponibles
- **Imágenes al publicar**: Hasta límite del marketplace (eBay: 12, ML: 10, Amazon: 9)

---

## ✅ Checklist de Validación

- [x] Sugerencias IA generan keywords específicas basadas en tendencias
- [x] Botón "Nueva sugerencia" funciona correctamente
- [x] Tarjetas de sugerencias muestran keywords y botón de búsqueda
- [x] Navegación desde sugerencia a /opportunities pre-llena keyword
- [x] Endpoint /api/credentials/status maneja errores sin bloquear
- [x] /opportunities funciona sin Network Error
- [x] Preview muestra todas las imágenes disponibles
- [x] Botón "Editar Producto" funciona correctamente
- [x] Workflow manual completo funciona E2E
- [x] Números formateados correctamente en KPIs

---

**Última actualización:** 2025-01-28  
**Autor:** Sistema de Desarrollo Ivan Reseller  
**Estado:** ✅ Completado y Documentado

