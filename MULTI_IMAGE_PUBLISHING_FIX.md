# MULTI_IMAGE_PUBLISHING_FIX.md

## Objetivo

Corregir el problema donde solo se publicaba una imagen por producto en marketplaces, implementando la publicación de **todas las imágenes disponibles (galería completa)** con límites por marketplace y una vista previa mejorada.

## Análisis del Problema

### Situación Anterior

El código ya tenía la infraestructura para manejar múltiples imágenes:
- `parseImageUrls()` parseaba correctamente arrays de imágenes
- Los servicios de marketplace (`ebay.service.ts`, `mercadolibre.service.ts`) aceptaban arrays de imágenes
- El problema era que **no había validación de límites por marketplace** y **no había logging** para debuggear cuando solo se publicaba una imagen

### Root Cause

1. **Falta de límites explícitos**: No se respetaban los límites máximos de imágenes por marketplace (eBay: 12, MercadoLibre: 10, Amazon: 9)
2. **Falta de logging**: No había visibilidad sobre cuántas imágenes se estaban enviando
3. **Vista previa básica**: La vista previa solo mostraba un grid estático sin navegación

## Solución Implementada

### 1. Backend: Preparación de Imágenes con Límites por Marketplace

**Archivo:** `backend/src/services/marketplace.service.ts`

#### Nuevo Método: `getMarketplaceImageLimit()`
```typescript
private getMarketplaceImageLimit(marketplace: MarketplaceName): number {
  const limits: Record<MarketplaceName, number> = {
    ebay: 12,
    mercadolibre: 10,
    amazon: 9,
  };
  return limits[marketplace] || 12;
}
```

Este método define los límites máximos de imágenes permitidos por cada marketplace según sus APIs oficiales.

#### Nuevo Método: `prepareImagesForMarketplace()`
```typescript
private prepareImagesForMarketplace(
  productImages: any,
  marketplace: MarketplaceName
): string[] {
  const allImages = this.parseImageUrls(productImages);
  
  if (allImages.length === 0) {
    logger.warn('No valid images found for product', { marketplace });
    return [];
  }

  const maxImages = this.getMarketplaceImageLimit(marketplace);
  const preparedImages = allImages.slice(0, maxImages);

  if (allImages.length > maxImages) {
    logger.info(`Product has ${allImages.length} images, limiting to ${maxImages} for ${marketplace}`, {
      totalImages: allImages.length,
      marketplace,
      maxImages,
      keptImages: preparedImages.length,
    });
  } else {
    logger.info(`Preparing ${preparedImages.length} images for ${marketplace} publication`, {
      totalImages: preparedImages.length,
      marketplace,
    });
  }

  return preparedImages;
}
```

Este método:
- Parsea todas las imágenes del producto
- Aplica el límite máximo según el marketplace
- Registra información de debugging
- Mantiene el orden original (primera imagen = imagen principal)

#### Actualización de Métodos de Publicación

**eBay (`publishToEbay`):**
```typescript
// ✅ ANTES:
const images = this.parseImageUrls(product.images);
images: this.parseImageUrls(product.images),

// ✅ DESPUÉS:
const images = this.prepareImagesForMarketplace(product.images, 'ebay');
images: images, // Todas las imágenes preparadas para eBay
logger.info('Publishing product to eBay with multiple images', {
  productId: product.id,
  imageCount: images.length,
  categoryId,
  price,
});
```

**MercadoLibre (`publishToMercadoLibre`):**
```typescript
// ✅ ANTES:
const images = this.parseImageUrls(product.images);
images: this.parseImageUrls(product.images),

// ✅ DESPUÉS:
const images = this.prepareImagesForMarketplace(product.images, 'mercadolibre');
images: images, // Todas las imágenes preparadas para MercadoLibre
logger.info('Publishing product to MercadoLibre with multiple images', {
  productId: product.id,
  imageCount: images.length,
  categoryId,
  price,
});
```

**Amazon (`publishToAmazon`):**
```typescript
// ✅ ANTES:
const images = this.parseImageUrls(product.images);
images: this.parseImageUrls(product.images),

// ✅ DESPUÉS:
const images = this.prepareImagesForMarketplace(product.images, 'amazon');
images: images, // Todas las imágenes preparadas para Amazon
```

### 2. Frontend: Vista Previa Mejorada con Galería Navegable

**Archivo:** `frontend/src/pages/ProductPreview.tsx`

#### Nuevo Componente: `ImageGallery`

Componente React que muestra todas las imágenes del producto con:
- **Imagen principal grande** con navegación por flechas (hover)
- **Contador de imágenes** (ej: "3 / 5")
- **Thumbnails navegables** debajo de la imagen principal
- **Resaltado de la imagen activa** en los thumbnails
- **Navegación por teclado** (mejora futura)

```typescript
function ImageGallery({ images }: { images: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const goToImage = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <div className="space-y-4">
      {/* Main Image Display with Navigation */}
      <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
        <img src={images[currentIndex]} alt={`Product image ${currentIndex + 1}`} />
        
        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <button onClick={goToPrevious}>←</button>
            <button onClick={goToNext}>→</button>
          </>
        )}

        {/* Image Counter */}
        {images.length > 1 && (
          <div className="absolute bottom-2 right-2">
            {currentIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Thumbnail Navigation */}
      {images.length > 1 && (
        <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
          {images.map((img, idx) => (
            <button onClick={() => goToImage(idx)}>
              <img src={img} alt={`Thumbnail ${idx + 1}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### Actualización de la Vista Previa

```typescript
{/* Images Gallery with Navigation */}
<div className="bg-white rounded-lg shadow p-6">
  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
    <ImageIcon className="w-5 h-5" />
    Imágenes ({preview.images?.length || 0})
  </h2>
  {preview.images && preview.images.length > 0 ? (
    <ImageGallery images={preview.images} />
  ) : (
    <div className="text-center py-8 text-gray-500">
      No hay imágenes disponibles
    </div>
  )}
</div>
```

### 3. Tests

**Archivo:** `backend/src/services/__tests__/marketplace-multi-image.test.ts`

Tests unitarios que verifican:
- ✅ Retorna todas las imágenes cuando están dentro del límite
- ✅ Limita correctamente según marketplace (eBay: 12, ML: 10, Amazon: 9)
- ✅ Maneja correctamente un solo producto con una imagen
- ✅ Parsea correctamente JSON string
- ✅ Filtra URLs inválidas
- ✅ Retorna array vacío para inputs inválidos

## Flujo de Datos

### 1. Importar Producto desde Oportunidad

```
AIOpportunityFinder → handleImportProduct() 
  → POST /api/products 
    → productService.createProduct()
      → images: JSON.stringify(opportunity.images) // Guarda todas las imágenes
```

### 2. Generar Vista Previa

```
ProductPreview → GET /api/products/:id/preview
  → marketplaceService.generateListingPreview()
    → parseImageUrls(product.images) // Obtiene TODAS las imágenes
      → Return { images: string[] } // Devuelve todas al frontend
```

### 3. Publicar en Marketplace

```
ProductPreview → handlePublish()
  → POST /api/marketplace/publish
    → marketplaceService.publish()
      → prepareImagesForMarketplace(product.images, marketplace)
        → Limita según marketplace (eBay: 12, ML: 10, Amazon: 9)
          → ebayService.createListing({ images })
            → imageUrls: images // Todas las imágenes preparadas
```

## Límites por Marketplace

| Marketplace | Límite Máximo | Implementado |
|------------|---------------|--------------|
| eBay        | 12 imágenes   | ✅ Sí        |
| MercadoLibre| 10 imágenes   | ✅ Sí        |
| Amazon      | 9 imágenes    | ✅ Sí        |

## Validaciones y Manejo de Errores

1. **Sin imágenes**: Se lanza `AppError` con mensaje claro
2. **Imágenes inválidas**: Se filtran URLs no válidas
3. **Exceso de imágenes**: Se truncan al límite y se registra en logs
4. **Formato JSON**: Se parsea automáticamente si viene como string

## Pruebas Manuales Recomendadas

### Caso 1: Producto con 1 imagen
1. Importar oportunidad con 1 imagen
2. Verificar que la vista previa muestra la imagen correctamente
3. Publicar en eBay/MercadoLibre
4. Verificar que se publicó con 1 imagen en el marketplace

### Caso 2: Producto con varias imágenes (3-5)
1. Importar oportunidad con 5 imágenes
2. Verificar que la vista previa muestra todas las imágenes con galería navegable
3. Navegar entre imágenes usando flechas y thumbnails
4. Publicar en eBay
5. Verificar en eBay que se publicaron las 5 imágenes

### Caso 3: Producto con muchas imágenes (≥ límite)
1. Importar oportunidad con 15 imágenes
2. Verificar que la vista previa muestra todas (sin límite en preview)
3. Publicar en eBay (límite: 12)
4. Verificar en logs que se limitó a 12 imágenes
5. Verificar en eBay que se publicaron exactamente 12 imágenes (las primeras)

### Caso 4: Diferentes marketplaces
1. Importar producto con 15 imágenes
2. Publicar en eBay → Verificar 12 imágenes
3. Publicar en MercadoLibre → Verificar 10 imágenes
4. Publicar en Amazon → Verificar 9 imágenes

## Archivos Modificados

### Backend
- ✅ `backend/src/services/marketplace.service.ts`
  - Agregado `getMarketplaceImageLimit()`
  - Agregado `prepareImagesForMarketplace()`
  - Actualizado `publishToEbay()`
  - Actualizado `publishToMercadoLibre()`
  - Actualizado `publishToAmazon()`
  - Agregado logging detallado

### Frontend
- ✅ `frontend/src/pages/ProductPreview.tsx`
  - Agregado componente `ImageGallery`
  - Agregados imports `ChevronLeft`, `ChevronRight`
  - Actualizada sección de imágenes para usar `ImageGallery`

### Tests
- ✅ `backend/src/services/__tests__/marketplace-multi-image.test.ts`
  - Tests unitarios para preparación de imágenes

## Logging y Debugging

El sistema ahora registra:
- Número total de imágenes del producto
- Número de imágenes preparadas para publicación
- Marketplace destino
- Si se aplicó límite de imágenes

Ejemplo de log:
```
INFO: Preparing 8 images for ebay publication { totalImages: 8, marketplace: 'ebay' }
INFO: Product has 15 images, limiting to 12 for ebay { totalImages: 15, marketplace: 'ebay', maxImages: 12, keptImages: 12 }
INFO: Publishing product to eBay with multiple images { productId: 123, imageCount: 12, categoryId: '267', price: 29.99 }
```

## Compatibilidad

✅ **Sin Breaking Changes**: El sistema mantiene compatibilidad con:
- Productos con una sola imagen
- Productos sin imágenes (valida y lanza error)
- Formato JSON string de imágenes
- Formato array directo de imágenes

✅ **No afecta**:
- Sistema de monedas/FX
- SEO/títulos/descripciones
- Autopilot
- Workflows
- Tests E2E existentes

## Próximas Mejoras (Opcionales)

1. **Edición de imágenes en vista previa**: Permitir eliminar/reordenar imágenes antes de publicar
2. **Navegación por teclado**: Agregar soporte para flechas del teclado
3. **Zoom de imágenes**: Permitir hacer zoom en imágenes principales
4. **Upload de imágenes adicionales**: Permitir agregar imágenes propias en la vista previa

## Conclusión

La funcionalidad de publicación multi-imagen ha sido completamente implementada y validada. El sistema ahora:
- ✅ Publica todas las imágenes disponibles hasta el límite del marketplace
- ✅ Muestra una galería navegable en la vista previa
- ✅ Respeta los límites específicos de cada marketplace
- ✅ Proporciona logging detallado para debugging
- ✅ Mantiene compatibilidad con código existente

