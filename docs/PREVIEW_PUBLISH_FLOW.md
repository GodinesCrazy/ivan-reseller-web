# Flujo de Vista Previa y Publicación

## Resumen del Flujo Actualizado

Este documento describe el flujo completo de importación, vista previa y publicación de productos en Ivan Reseller.

## Flujo Manual Completo

### 1. Importar Producto
- **Origen**: `/opportunities` o Dashboard → Oportunidades IA
- **Acción**: Usuario hace clic en "Importar"
- **Resultado**: 
  - Se crea un producto en la base de datos con `status: 'PENDING'`
  - El producto se guarda con todas las imágenes disponibles (array completo)
  - Redirección a `/products` (lista de productos)

### 2. Ver Producto en Lista
- **Pantalla**: `/products` (Products Management)
- **Estado**: Producto aparece con estado `PENDING`
- **Acción**: Usuario hace clic en el ícono de ojo (👁️) para ver detalles

### 3. Vista Previa del Producto
- **Pantalla**: `/products/:id/preview?marketplace=ebay`
- **Componente**: `ProductPreview.tsx`
- **Características**:
  - **Galería de Imágenes**: Muestra TODAS las imágenes disponibles del producto
    - Componente `ImageGallery` con navegación (flechas, thumbnails)
    - Imagen principal grande + miniaturas clicables
    - Contador de imágenes (ej: "1 / 5")
  - **Información del Listing**:
    - Título, descripción, precio
    - Moneda de destino
    - Desglose de costos (margen, ROI, fees)
    - Categoría, tags, SEO keywords
  - **Acciones Disponibles**:
    - **"Editar Producto"**: Abre modal para editar título, descripción, precio, etc.
    - **"Publicar"**: Envía el producto a Intelligent Publisher (NO publica directamente)
    - **"Cancelar"**: Regresa a la lista de productos

### 4. Enviar a Intelligent Publisher
- **Acción**: Usuario hace clic en botón "Publicar" en la vista previa
- **Backend**:
  - Endpoint: `POST /api/publisher/send_for_approval/:productId`
  - Asegura que el producto esté en estado `PENDING`
  - Si el producto ya está en otro estado, lo actualiza a `PENDING`
- **Frontend**:
  - Muestra toast de éxito: "✅ Producto enviado a Intelligent Publisher para aprobación"
  - Redirección automática a `/publisher`

### 5. Intelligent Publisher
- **Pantalla**: `/publisher`
- **Componente**: `IntelligentPublisher.tsx`
- **Funcionalidad**:
  - Lista todos los productos con `status: 'PENDING'`
  - Muestra información enriquecida: imagen, título, costos, margen, ROI
  - Usuario puede:
    - Seleccionar marketplace(s) donde publicar (eBay, MercadoLibre, Amazon)
    - Hacer clic en "Approve & Publish" para publicar en los marketplaces seleccionados
    - Publicar múltiples productos en bulk

### 6. Publicación Real
- **Acción**: Usuario hace clic en "Approve & Publish" en Intelligent Publisher
- **Backend**:
  - Endpoint: `POST /api/publisher/approve/:productId`
  - Publica el producto en los marketplaces seleccionados
  - Actualiza el estado del producto a `PUBLISHED`
- **Resultado**: 
  - Producto publicado en el/los marketplace(s) seleccionado(s)
  - Estado del producto cambia a `PUBLISHED`
  - Se crea registro en `marketplace_listings` con la URL del listing

## Componentes y Servicios Clave

### Frontend

#### `ProductPreview.tsx`
- **Ruta**: `/products/:id/preview`
- **Props**: `id` (productId), `marketplace` (query param)
- **Funcionalidades**:
  - Carga preview del listing desde `GET /api/products/:id/preview`
  - Renderiza galería completa de imágenes con `ImageGallery`
  - Botón "Publicar" llama a `POST /api/publisher/send_for_approval/:productId`
  - Redirección a `/publisher` después de enviar

#### `ImageGallery` (componente interno)
- **Props**: `images: string[]`
- **Características**:
  - Imagen principal grande con navegación (flechas izquierda/derecha)
  - Thumbnails clicables debajo
  - Contador de imágenes
  - Manejo de errores de carga de imágenes

#### `IntelligentPublisher.tsx`
- **Ruta**: `/publisher`
- **Funcionalidades**:
  - Carga productos pendientes desde `GET /api/publisher/pending`
  - Muestra lista de productos con información enriquecida
  - Permite seleccionar marketplaces y publicar
  - Bulk publishing para múltiples productos

### Backend

#### `GET /api/products/:id/preview`
- **Servicio**: `MarketplaceService.generateListingPreview()`
- **Retorna**: Preview del listing con todas las imágenes, título, descripción, precios, fees, etc.
- **Imágenes**: Usa `parseImageUrls()` para extraer todas las URLs del campo `images` (JSON)

#### `POST /api/publisher/send_for_approval/:productId`
- **Nuevo endpoint** creado para este flujo
- **Funcionalidad**:
  - Verifica que el producto existe y pertenece al usuario
  - Asegura que el producto esté en estado `PENDING`
  - Si no está en PENDING, lo actualiza usando `productService.updateProductStatusSafely()`
- **Retorna**: Confirmación de que el producto fue enviado

#### `GET /api/publisher/pending`
- **Servicio**: `productService.getProducts(userId, 'PENDING')`
- **Retorna**: Lista de productos con estado `PENDING` enriquecidos con información adicional

#### `POST /api/publisher/approve/:productId`
- **Servicio**: `MarketplaceService.publishProduct()` para cada marketplace seleccionado
- **Funcionalidad**: Publica el producto en los marketplaces seleccionados y actualiza el estado

## Modelo de Datos

### Producto (Product)
- **Campo `images`**: JSON string con array de URLs de imágenes
  - Ejemplo: `["https://...", "https://...", ...]`
  - Primera imagen es la principal
- **Campo `status`**: `'PENDING' | 'APPROVED' | 'REJECTED' | 'PUBLISHED' | 'INACTIVE'`
- **Campo `isPublished`**: Boolean que indica si está publicado

### Flujo de Estados
1. **Importar**: `status: 'PENDING'`, `isPublished: false`
2. **Enviar a Publisher**: `status: 'PENDING'` (asegurado)
3. **Aprobar y Publicar**: `status: 'PUBLISHED'`, `isPublished: true`

## Cambios Implementados

### 1. Vista Previa con Todas las Imágenes
- ✅ Componente `ImageGallery` implementado con navegación completa
- ✅ Preview carga todas las imágenes desde el campo `images` (JSON)
- ✅ Thumbnails clicables y contador de imágenes

### 2. Botón "Publicar" Modificado
- ✅ Texto cambiado de "Publicar en {marketplace}" a solo "Publicar"
- ✅ Comportamiento cambiado: ya NO publica directamente
- ✅ Envía el producto a Intelligent Publisher
- ✅ Redirección a `/publisher` después de enviar

### 3. Nuevo Endpoint para Enviar a Publisher
- ✅ `POST /api/publisher/send_for_approval/:productId`
- ✅ Asegura que el producto esté en estado `PENDING`
- ✅ Verifica permisos (usuario solo puede enviar sus propios productos)

## Flujos que NO se Modificaron (Regresiones Prevenidas)

### Autopilot
- ✅ Autopilot sigue funcionando igual
- ✅ Crea productos con `status: 'PENDING'` automáticamente
- ✅ Usa `MarketplaceService.publishProduct()` directamente cuando corresponde

### Bulk Publishing
- ✅ Intelligent Publisher sigue permitiendo publicar múltiples productos en bulk
- ✅ Usa `/api/jobs/publishing` para encolar trabajos de publicación

### Publicación Directa desde Otras Partes
- ✅ El endpoint `/api/marketplace/publish` sigue disponible para otros usos
- ✅ No se modificó la lógica de publicación real

## Testing

### Escenario A: Producto con Varias Imágenes
1. Importar producto desde AliExpress con múltiples imágenes
2. Verificar en `/products` que el producto aparece
3. Hacer clic en ojo → Preview
4. **Verificar**: Se muestran todas las imágenes (galería con navegación)
5. Hacer clic en "Publicar"
6. **Verificar**: Redirección a `/publisher`
7. **Verificar**: Producto aparece en lista de Pending approvals
8. Seleccionar marketplace(s) y hacer clic en "Approve & Publish"
9. **Verificar**: Producto se publica correctamente

### Escenario B: Producto con Una Sola Imagen
1. Importar producto con solo una imagen
2. Abrir preview
3. **Verificar**: Se muestra la imagen (sin navegación, ya que solo hay una)
4. Hacer clic en "Publicar"
5. **Verificar**: Flujo funciona igual que con múltiples imágenes

### Escenario C: Regresiones
1. **Autopilot**: Verificar que sigue funcionando correctamente
2. **Bulk Publishing**: Verificar que se pueden publicar múltiples productos desde Intelligent Publisher
3. **Oportunidades IA**: Verificar que el flujo de importación sigue funcionando
4. **Compilación**: Verificar que no hay errores de TypeScript

## Archivos Modificados

### Frontend
- `frontend/src/pages/ProductPreview.tsx`
  - Modificado `handlePublish()` para enviar a Intelligent Publisher
  - Cambiado texto del botón a "Publicar"
  - `ImageGallery` ya estaba implementado correctamente

### Backend
- `backend/src/api/routes/publisher.routes.ts`
  - Agregado endpoint `POST /api/publisher/send_for_approval/:productId`

## Notas Técnicas

- El campo `images` en la base de datos es un JSON string que contiene un array de URLs
- La primera imagen del array se considera la imagen principal
- El endpoint de preview (`/api/products/:id/preview`) ya parsea correctamente todas las imágenes
- El estado `PENDING` es el estado requerido para que un producto aparezca en Intelligent Publisher
- Los usuarios solo pueden enviar sus propios productos a Intelligent Publisher (excepto admins)

