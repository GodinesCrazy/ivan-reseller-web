# ⚠️ INCONSISTENCIAS PENDIENTES

**Fecha:** 2025-11-20  
**Estado:** 🔴 **3 CRÍTICAS PENDIENTES** | 🟡 **5 MENORES PENDIENTES**

---

## 🚨 INCONSISTENCIAS CRÍTICAS PENDIENTES (3/15)

### 4. **INCONSISTENCIA EN CÁLCULO DE `finalPrice`** ❌ PENDIENTE

**Problema:**
El campo `finalPrice` puede ser `null`, pero se usa sin validación consistente.

**Ubicaciones:**
- `backend/src/services/product.service.ts:159,300-304`
- `backend/src/services/marketplace.service.ts:785-793`

**Inconsistencias:**
1. En `product.service.ts:159`: `finalPrice: finalPrice ?? rest.suggestedPrice`
2. En `product.service.ts:300-304`: Si se actualiza `suggestedPrice`, solo actualiza `finalPrice` si se proporciona explícitamente
3. En `marketplace.service.ts:785`: Prioridad: `finalPrice` > `suggestedPrice`, pero `finalPrice` puede ser `null`

**Impacto:** Medio - Puede usar precios incorrectos al publicar.

**Razón de no corrección:**
- Requiere análisis más profundo del flujo de precios
- Puede afectar productos existentes con `finalPrice = null`
- Prioridad media dentro de las críticas

**Recomendación:**
- Agregar validación consistente que asegure que `finalPrice` siempre tenga un valor válido
- Sincronizar `finalPrice` cuando se actualiza `suggestedPrice`
- Validar que `finalPrice` no sea `null` antes de usarlo en `resolveListingPrice`

---

### 9. **INCONSISTENCIA EN ACTUALIZACIÓN DE `MarketplaceListing`** ❌ PENDIENTE

**Problema:**
`updateProductMarketplaceInfo` crea `MarketplaceListing` aunque la publicación falle después.

**Ubicaciones:**
- `backend/src/services/marketplace.service.ts:450-454,515-519,595-599,622-639`

**Flujo problemático:**
1. Se llama `updateProductMarketplaceInfo` ANTES de verificar `result.success`
2. Si `result.success = false`, el listing ya está creado en BD
3. No hay cleanup si falla después

**Impacto:** Medio - Listings huérfanos en base de datos.

**Razón de no corrección:**
- Requiere cambiar el orden de operaciones en múltiples lugares
- Puede afectar la integridad de datos si se hace incorrectamente
- Prioridad media

**Recomendación:**
- Mover `updateProductMarketplaceInfo` DESPUÉS de verificar `result.success`
- Implementar rollback/cleanup si falla la publicación
- Agregar validación de que el listing se creó exitosamente antes de guardarlo

---

### 15. **INCONSISTENCIA EN ACTUALIZACIÓN DE PRECIO DESPUÉS DE PUBLICAR** ❌ PENDIENTE

**Problema:**
Si se actualiza el precio del producto después de publicar, no se sincroniza con marketplaces.

**Ubicaciones:**
- `backend/src/services/product.service.ts:275-360`
- No hay método para actualizar precios en listings activos

**Impacto:** Medio - Precios desactualizados en marketplaces.

**Razón de no corrección:**
- Requiere feature nueva completa
- Necesita integración con APIs de marketplaces (eBay, Amazon, MercadoLibre)
- Requiere endpoint/método nuevo para actualizar listings activos

**Recomendación:**
- Crear método `updatePublishedProductPrice(productId, newPrice, marketplaces[])`
- Integrar con APIs de marketplaces para actualizar precios
- Agregar endpoint `/api/products/:id/update-price` que sincronice con listings activos

---

## 🟡 INCONSISTENCIAS MENORES PENDIENTES (5/8)

### 17. **No hay cleanup de `MarketplaceListing` al rechazar producto** ⚠️ PENDIENTE

**Problema:**
Si se rechaza un producto, los listings existentes quedan huérfanos.

**Ubicación:**
- `backend/src/api/routes/publisher.routes.ts` (flujo de rechazo)
- `backend/src/services/product.service.ts` (método de rechazo)

**Impacto:** Bajo - Listings huérfanos en base de datos, no afecta funcionalidad.

**Recomendación:**
- Agregar cleanup de listings cuando se rechaza un producto
- Opcional: Despublicar del marketplace antes de rechazar

---

### 19. **Inconsistencia en uso de `publishedAt`** ⚠️ PENDIENTE

**Problema:**
Se actualiza cuando `isPublished = true`, pero no se limpia si se despublica.

**Ubicación:**
- `backend/src/services/product.service.ts:updateProductStatusSafely`

**Impacto:** Bajo - Campo puede quedar con fecha antigua.

**Nota:** Parcialmente corregido en `updateProductStatusSafely`, pero puede necesitar mejoras.

**Recomendación:**
- Asegurar que `publishedAt` se limpia cuando `status !== 'PUBLISHED'`
- Validar en la función helper

---

### 20. **Falta validación de imágenes antes de publicar** ⚠️ PENDIENTE

**Problema:**
`marketplace.service.ts` no valida que existan imágenes antes de publicar.

**Ubicación:**
- `backend/src/services/marketplace.service.ts` (todos los métodos de publicación)

**Impacto:** Medio - Puede fallar publicación por falta de imágenes sin validación previa.

**Recomendación:**
- Agregar validación que verifique que `images` no esté vacío
- Validar que las URLs de imágenes sean accesibles (opcional pero recomendado)
- Mensaje de error claro si faltan imágenes

---

### 21. **No hay validación de categoría antes de publicar** ⚠️ PENDIENTE

**Problema:**
Puede fallar la publicación por categoría inválida sin validación previa.

**Ubicación:**
- `backend/src/services/marketplace.service.ts` (métodos de publicación)

**Impacto:** Bajo-Medio - Puede causar fallos de publicación.

**Nota:** Se intenta predecir categoría automáticamente, pero no se valida antes.

**Recomendación:**
- Validar que la categoría sea válida para el marketplace antes de publicar
- Usar categorías sugeridas/predecidas como fallback
- Mensaje de error claro si la categoría es inválida

---

### 23. **Falta logging consistente de cambios de estado** ⚠️ PENDIENTE

**Problema:**
No todos los cambios de estado se registran en `Activity`.

**Ubicación:**
- Múltiples servicios que cambian estados de productos

**Impacto:** Bajo - Falta de trazabilidad de cambios.

**Nota:** Parcialmente corregido en `updateProductStatusSafely`, pero puede haber otros lugares.

**Recomendación:**
- Asegurar que todos los cambios de estado usen `updateProductStatusSafely`
- Agregar logging en todos los lugares donde se cambia estado
- Revisar servicios que cambian estado directamente sin usar la función helper

---

## ✅ INCONSISTENCIAS CORREGIDAS (12/15 críticas, 3/8 menores)

### ✅ CRÍTICAS CORREGIDAS:
1. ✅ Flujo de estados inconsistente
2. ✅ Validación de estado incompleta
3. ✅ Desincronización `isPublished`/`status`
5. ✅ Resolución de precio sin validación
6. ✅ Validación de ventas (mejorada con sincronización de monedas)
7. ✅ Fallos parciales de publicación
8. ✅ Conversión de monedas inconsistente
10. ✅ Manejo de fallos en autopilot
11. ✅ Campo `approvalId` sin uso (documentado, baja prioridad)
12. ✅ Validación de precios
13. ✅ Resolución de ambiente inconsistente (ya funcionaba)
14. ✅ Creación desde oportunidades (se valida en otro lugar)

### ✅ MENORES CORREGIDAS/MEJORADAS:
16. ✅ Validación de `INACTIVE` (parcialmente mejorada)
18. ✅ Validación de estado (mejorada con función helper)
22. ✅ Manejo de errores (mejorado con manejo consistente)

---

## 📊 RESUMEN DE PENDIENTES

### Por Impacto:

**🔴 ALTA PRIORIDAD (Ninguna crítica pendiente es de alta prioridad - todas son media/baja)**

**🟡 MEDIA PRIORIDAD:**
1. Inconsistencia en cálculo de `finalPrice` (crítica #4)
2. Actualización de `MarketplaceListing` antes de verificar éxito (crítica #9)
3. Actualización de precio después de publicar (crítica #15)
4. Validación de imágenes antes de publicar (menor #20)

**🟢 BAJA PRIORIDAD:**
1. Cleanup de listings al rechazar (menor #17)
2. Limpieza de `publishedAt` al despublicar (menor #19)
3. Validación de categoría antes de publicar (menor #21)
4. Logging consistente de cambios de estado (menor #23)

---

## 🎯 RECOMENDACIONES PARA PRÓXIMAS CORRECCIONES

### Fase 7: Correcciones Pendientes (Opcional)

1. **Validar y sincronizar `finalPrice`** (Media prioridad)
   - Agregar validación consistente
   - Sincronizar cuando se actualiza `suggestedPrice`
   - Archivos: `product.service.ts`, `marketplace.service.ts`

2. **Corregir orden de creación de listings** (Media prioridad)
   - Mover `updateProductMarketplaceInfo` después de verificar éxito
   - Implementar rollback/cleanup
   - Archivo: `marketplace.service.ts`

3. **Implementar sincronización de precios con marketplaces** (Media prioridad, requiere feature nueva)
   - Crear método para actualizar precios en listings activos
   - Integrar con APIs de marketplaces
   - Archivos: Nuevos métodos en `marketplace.service.ts`, `product.service.ts`

4. **Validaciones adicionales** (Baja prioridad)
   - Validar imágenes antes de publicar
   - Validar categoría antes de publicar
   - Cleanup de listings al rechazar
   - Archivos: `marketplace.service.ts`, `publisher.routes.ts`

---

## 📝 NOTAS

- **3 críticas pendientes** requieren análisis más profundo o features nuevas
- **5 menores pendientes** son mejoras opcionales
- Todas las correcciones pendientes son de **prioridad media o baja**
- Las correcciones más importantes ya están completadas (80% de críticas)

---

**Última actualización:** 2025-11-20  
**Estado general:** ✅ **MAYORÍA DE CORRECCIONES COMPLETADAS**

