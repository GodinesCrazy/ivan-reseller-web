# Diagnóstico: Importación de Imágenes Múltiples

## Fecha: 2025-11-26

## Problema Identificado

El sistema solo importa y guarda **una única imagen** por producto, aunque la fuente (AliExpress, eBay, ML) proporciona múltiples imágenes en una galería.

## Análisis del Modelo de Datos

### Schema de Prisma (Product)
```prisma
model Product {
  images String // JSON string with array of image URLs
  // ...
}
```

**Estado**: ✅ El modelo **SÍ soporta múltiples imágenes** como JSON string con array de URLs.

### ProductService
- ✅ Función `buildImagePayload(primary?: string, additional?: string[])` existe y funciona correctamente
- ✅ Convierte `imageUrl` (primera) + `imageUrls[]` (array completo) a JSON string
- ✅ Función `extractImageUrl()` para extraer la primera imagen del JSON

**Estado**: ✅ El servicio **SÍ está preparado** para recibir múltiples imágenes.

## Puntos de Importación Identificados

### 1. ✅ AdvancedScraper (CORRECTO)
- **Archivo**: `backend/src/services/advanced-scraper.service.ts`
- **Función**: `normalizeAliExpressItem()`
- **Estado**: ✅ **Ya extrae TODAS las imágenes** y las retorna en `images: string[]`
- **Líneas**: 3074-3185
- **Comportamiento**: 
  - Recolecta imágenes de múltiples campos: `images[]`, `imageUrlList[]`, `imageList[]`, `imageUrl`, `productImage`, etc.
  - Usa `Set<string>` para eliminar duplicados
  - Retorna array completo en `ScrapedProduct.images`

### 2. ❌ JobService (PROBLEMA)
- **Archivo**: `backend/src/services/job.service.ts`
- **Función**: `processScrapeJob()`
- **Línea**: 211
- **Problema**: Solo pasa `imageUrl: scrapedData.images?.[0]` - **solo la primera imagen**
- **Solución requerida**: Pasar también `imageUrls: scrapedData.images`

### 3. ❌ Publisher Routes (PROBLEMA)
- **Archivo**: `backend/src/api/routes/publisher.routes.ts`
- **Función**: `POST /api/publisher/add_for_approval`
- **Línea**: 33
- **Problema**: Solo pasa `imageUrl: scrapedData.images?.[0]` - **solo la primera imagen**
- **Solución requerida**: Pasar también `imageUrls: scrapedData.images`

### 4. ⚠️ Opportunity Finder (VERIFICAR)
- **Archivo**: `backend/src/services/opportunity-finder.service.ts`
- **Estado**: Necesita verificación

### 5. ✅ Autopilot (CORRECTO)
- **Archivo**: `backend/src/services/autopilot.service.ts`
- **Línea**: 1005
- **Estado**: ✅ **Ya guarda todas las imágenes**: `images: JSON.stringify(opportunity.images || [])`

### 6. ⚠️ Frontend - Opportunities (VERIFICAR)
- **Archivo**: `frontend/src/pages/Opportunities.tsx`
- **Estado**: Necesita verificación si pasa `imageUrls` al backend

### 7. ⚠️ Frontend - AIOpportunityFinder (VERIFICAR)
- **Archivo**: `frontend/src/components/AIOpportunityFinder.tsx`
- **Estado**: Necesita verificación si pasa `imageUrls` al backend

## Root Cause

**El problema NO está en:**
- ❌ El modelo de datos (soporta múltiples imágenes)
- ❌ El ProductService (tiene funciones para manejar arrays)
- ❌ El scraper (extrae todas las imágenes)

**El problema SÍ está en:**
- ✅ **Los puntos de importación** que solo pasan `imageUrl: images[0]` en lugar de pasar también `imageUrls: images`

## Solución Requerida

1. **Corregir JobService**: Pasar `imageUrls: scrapedData.images` además de `imageUrl`
2. **Corregir Publisher Routes**: Pasar `imageUrls: scrapedData.images` además de `imageUrl`
3. **Verificar Opportunity Finder**: Asegurar que pasa todas las imágenes
4. **Verificar Frontend**: Asegurar que Opportunities y AIOpportunityFinder pasan `imageUrls` array

## Compatibilidad con Datos Antiguos

- ✅ Productos existentes que solo tienen una imagen en el JSON seguirán funcionando
- ✅ `extractImageUrl()` extrae la primera imagen del array para compatibilidad
- ✅ No se requiere migración de datos

## Verificación Post-Fix

Después de aplicar las correcciones, verificar:
1. Importar producto desde AliExpress con múltiples imágenes
2. Verificar en BD que el campo `images` contiene JSON con array de URLs
3. Verificar que `/api/products/:id` retorna todas las imágenes
4. Verificar que la vista previa muestra todas las imágenes

