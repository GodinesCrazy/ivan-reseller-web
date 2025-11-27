# 🔧 Corrección de SIGSEGV en Sugerencias IA - Log 510

**Fecha:** 2025-01-26  
**Problema:** Sistema crashea con SIGSEGV al cargar sugerencias IA  
**Log:** `510.log`

---

## 🔍 Problemas Identificados

### 1. **SIGSEGV durante Serialización JSON** ❌
- **Causa:** Objetos con `Prisma.Decimal`, referencias circulares, o valores extremos no se sanitizaban correctamente antes de serializar.
- **Ubicación:** `backend/src/services/ai-suggestions.service.ts` - función `getSuggestions`
- **Evidencia en log:**
  - Línea 17-18: `AISuggestions: getSuggestions retornando 14 sugerencias`
  - Línea 19-23: `npm error signal SIGSEGV` (crash inmediato después)

### 2. **Error en Middleware de Autenticación** ❌
- **Causa:** `r.toUpperCase is not a function` - `roles` puede contener valores no-string.
- **Ubicación:** `backend/src/middleware/auth.middleware.ts` línea 175
- **Evidencia en log:**
  - Línea 590: `TypeError: r.toUpperCase is not a function`

### 3. **Error en Prisma SystemConfig** ❌
- **Causa:** `key: undefined` siendo pasado a `findUnique()`.
- **Ubicación:** `backend/src/services/pending-products-limit.service.ts`
- **Evidencia en log:**
  - Líneas 577-582, 595-611: `Invalid prisma.systemConfig.findUnique() invocation` con `key: undefined`

### 4. **Credenciales Corruptas** ⚠️
- **Causa:** Las credenciales configuradas no pueden desencriptarse (posible cambio de `ENCRYPTION_KEY`).
- **Evidencia en log:**
  - Líneas 634-655: Múltiples errores de decriptación para eBay, PayPal, ScraperAPI, ZenRows, Groq
  - **Nota:** El sistema las desactiva automáticamente, pero puede causar problemas en operaciones posteriores.

---

## ✅ Correcciones Implementadas

### 1. **Sanitización Mejorada en `ai-suggestions.service.ts`**

```typescript
// ✅ Mejoras implementadas:
- Detección mejorada de Prisma.Decimal
- Validación estricta de valores numéricos (límite reducido a 1e12)
- Detección de referencias circulares más robusta
- Límite de profundidad de recursión (10 niveles)
- Validación de serialización inmediata después de sanitizar
- Filtrado de sugerencias no serializables antes de retornar
- Límites de tamaño (arrays: 1000 elementos, objetos: 100 propiedades, strings: 5000 caracteres)
```

**Cambios clave:**
- Función `sanitizeForJson` mejorada con mejor manejo de tipos
- Validación de serialización después de cada sanitización
- Filtrado de sugerencias no serializables en el `map`
- Límites más conservadores para prevenir problemas de memoria

### 2. **Corrección en Middleware de Autenticación**

```typescript
// ✅ Antes:
const allowedRolesUpper = roles.map(r => r.toUpperCase());

// ✅ Después:
const allowedRolesUpper = roles
  .filter(r => typeof r === 'string' && r.trim().length > 0)
  .map(r => String(r).toUpperCase());
```

**Cambios:**
- Validación de que `roles` sean strings antes de llamar `toUpperCase()`
- Filtrado de valores inválidos (null, undefined, strings vacíos)
- Validación de que `userRole` sea string también

### 3. **Corrección en `pending-products-limit.service.ts`**

```typescript
// ✅ Validación agregada:
if (!this.CONFIG_KEY || typeof this.CONFIG_KEY !== 'string' || this.CONFIG_KEY.trim().length === 0) {
  logger.warn('PendingProductsLimitService: CONFIG_KEY no válido, usando valor por defecto');
  return this.DEFAULT_LIMIT;
}
```

**Cambios:**
- Validación de `CONFIG_KEY` antes de usarlo
- Mejor logging de errores con más contexto
- Conversión explícita a string de `config.value`

### 4. **Protección Adicional en Rutas**

```typescript
// ✅ Mejoras en ai-suggestions.routes.ts:
- Validación de que suggestions sea array
- Filtrado de sugerencias nulas/undefined
- Límite de 50 sugerencias máximo
- Validación individual de cada sugerencia antes de agregar
- Validación de tamaño de respuesta (límite 10MB)
- Mejor manejo de errores con respuesta mínima válida
```

---

## 🧪 Validación Post-Fix

### Tests Recomendados:

1. **Test de Carga de Sugerencias:**
   ```bash
   # Verificar que no hay SIGSEGV
   curl -H "Authorization: Bearer TOKEN" https://api.ivanreseller.com/api/ai-suggestions
   ```

2. **Test de Middleware:**
   - Verificar que rutas con `authorize()` funcionen correctamente
   - Verificar que no se produzca error `toUpperCase`

3. **Test de SystemConfig:**
   - Verificar que `getMaxPendingProducts()` retorne valor por defecto si hay problema

4. **Test de Credenciales:**
   - Las credenciales corruptas ya fueron desactivadas automáticamente
   - **Acción requerida:** Reconfigurar APIs desde Settings → API Settings

---

## 📝 Acciones Requeridas del Usuario

1. **Reconfigurar APIs Corruptas:**
   - Las siguientes APIs tienen credenciales corruptas y fueron desactivadas:
     - eBay (sandbox y production)
     - PayPal (production)
     - ScraperAPI (production)
     - ZenRows (production)
     - Groq (production)
   - **Solución:** Ir a Settings → API Settings y volver a guardar las credenciales para cada API.

2. **Monitoreo:**
   - Verificar logs después del deploy para confirmar que no hay más SIGSEGV
   - Monitorear el endpoint `/api/ai-suggestions` durante 24h

---

## 🎯 Resultado Esperado

- ✅ **Sin SIGSEGV** al cargar sugerencias IA
- ✅ **Sin errores** en middleware de autenticación
- ✅ **Sin errores** en SystemConfig queries
- ✅ **Sugerencias serializadas correctamente** sin crashes
- ✅ **Respuestas válidas** incluso si hay problemas de serialización individuales

---

## 📊 Archivos Modificados

1. `backend/src/services/ai-suggestions.service.ts`
   - Función `sanitizeForJson` mejorada
   - Validación de serialización después de sanitizar
   - Filtrado de sugerencias no serializables

2. `backend/src/middleware/auth.middleware.ts`
   - Validación de tipos en `authorize()`

3. `backend/src/services/pending-products-limit.service.ts`
   - Validación de `CONFIG_KEY` antes de usar

4. `backend/src/api/routes/ai-suggestions.routes.ts`
   - Validación adicional de sugerencias antes de enviar
   - Límites de tamaño de respuesta
   - Mejor manejo de errores

---

**Estado:** ✅ **Correcciones Implementadas**  
**Próximo paso:** Deploy y validación en producción

