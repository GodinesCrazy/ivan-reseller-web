# 🔧 CORRECCIONES DE ERRORES OAuth - 2025-11-15

**Fecha**: 2025-11-15  
**Usuario afectado**: cona (userId: 41)  
**Problema**: Errores persistentes al guardar credenciales de eBay OAuth

---

## 📋 RESUMEN

Se identificaron y corrigieron **2 errores críticos** que impedían guardar correctamente las credenciales de eBay:

1. **Error del cache**: Función síncrona llamada como Promise
2. **Error del redirectUri**: URL completa guardada en lugar del RuName

---

## ❌ ERROR 1: Cache - Función Síncrona Llamada como Promise

### Problema
```typescript
// ❌ INCORRECTO (causaba error)
await clearCredentialsCache(targetUserId, apiName, env).catch(err => {
  logger.warn(`Failed to clear credentials cache`, { error: err });
});
```

**Error en logs**:
```
Error invalidating cache after saving credentials
error: "Cannot read properties of undefined (reading 'catch')"
```

### Causa
- `clearCredentialsCache()` es una función **síncrona** que retorna `void`
- Se estaba llamando con `await` y `.catch()` como si fuera una Promise
- Esto causaba que `undefined.catch()` fallara

### Solución Implementada
**Archivo**: `backend/src/api/routes/api-credentials.routes.ts` (líneas 425-432)

```typescript
// ✅ CORRECTO
// Nota: clearCredentialsCache es síncrona (void), no una Promise
try {
  const { clearCredentialsCache } = await import('../../services/credentials-manager.service');
  clearCredentialsCache(targetUserId, apiName, env);
} catch (err: any) {
  logger.warn(`Failed to clear credentials cache`, { 
    error: err?.message || err, 
    userId: targetUserId, 
    apiName, 
    environment: env 
  });
}
```

### Impacto
- ✅ **Error eliminado**: Ya no aparece el error "Cannot read properties of undefined"
- ✅ **Cache funciona correctamente**: Las credenciales se invalidan correctamente
- ✅ **No bloquea operaciones**: Si falla, solo se registra un warning

---

## ❌ ERROR 2: RedirectUri - URL Completa en lugar de RuName

### Problema
En algunos casos, se estaba guardando la **URL completa de OAuth** en lugar del **RuName** (Redirect URI Name), causando:

```
[API Credentials] Validation failed for ebay
errors: ["redirectUri: Redirect URI must not exceed 255 characters"]
```

**Ejemplo del error**:
```json
{
  "redirectUri": "https://auth.sandbox.ebay.com/oauth2/authorize?client_id=SBX-688f1b06f-6f79a112&redirect_uri=Constanza_Santa-Constanz-ivanre-blbcfwx&response_type=code&scope=..."
}
```

**Debería ser**:
```json
{
  "redirectUri": "Constanza_Santa-Constanz-ivanre-blbcfwx"
}
```

### Causa
- Posible confusión en el frontend o backend donde se copia/pega la URL completa
- Falta de validación que detecte y corrija este problema automáticamente

### Solución Implementada
**Archivo**: `backend/src/services/credentials-manager.service.ts` (líneas 342-372)

```typescript
// 🔒 VALIDACIÓN: Prevenir que se guarde una URL completa de OAuth en lugar del RuName
if (creds.redirectUri && typeof creds.redirectUri === 'string') {
  creds.redirectUri = creds.redirectUri.trim();
  
  // Si el redirectUri parece ser una URL completa de OAuth, extraer solo el RuName
  if (creds.redirectUri.length > 255 || 
      creds.redirectUri.includes('auth.sandbox.ebay.com') || 
      creds.redirectUri.includes('auth.ebay.com')) {
    try {
      const originalRedirectUri = creds.redirectUri;
      const url = new URL(creds.redirectUri);
      const redirectUriParam = url.searchParams.get('redirect_uri');
      
      if (redirectUriParam) {
        // Extraer el RuName del parámetro redirect_uri de la URL
        const extractedRuName = decodeURIComponent(redirectUriParam).trim();
        creds.redirectUri = extractedRuName;
        
        logger.warn('[CredentialsManager] Detected OAuth URL instead of RuName, extracted redirect_uri parameter', {
          originalLength: originalRedirectUri.length,
          extractedLength: extractedRuName.length,
          preview: extractedRuName.substring(0, 50) + '...'
        });
      }
    } catch (urlError) {
      // No es una URL válida, continuar con el valor original
      // La validación de Zod lo rechazará si excede 255 caracteres
    }
  }
}
```

### Impacto
- ✅ **Detección automática**: El sistema detecta si se envía una URL completa
- ✅ **Corrección automática**: Extrae el RuName del parámetro `redirect_uri`
- ✅ **Logging**: Registra una advertencia cuando se corrige automáticamente
- ✅ **Prevención**: Evita que se guarden URLs completas que excedan 255 caracteres

---

## 📝 CORRECCIONES ADICIONALES

### Documentación Corregida
**Archivo**: `FASE_4_PERFORMANCE_COMPLETADA.md` (líneas 53-60)

Se corrigió la documentación que mostraba código incorrecto, actualizándola para reflejar la implementación correcta.

---

## ✅ VERIFICACIÓN

### Archivos Modificados
1. ✅ `backend/src/api/routes/api-credentials.routes.ts` - Corregido manejo del cache
2. ✅ `backend/src/services/credentials-manager.service.ts` - Agregada validación de redirectUri
3. ✅ `FASE_4_PERFORMANCE_COMPLETADA.md` - Corregida documentación

### Tests Realizados
- ✅ No se encontraron otros lugares con el mismo patrón de error
- ✅ No se encontraron otros lugares donde se pueda guardar URLs completas
- ✅ La validación funciona correctamente para detectar y corregir URLs completas

---

## 🎯 RESULTADO

**Estado**: ✅ **TODOS LOS ERRORES CORREGIDOS**

La usuaria "cona" ahora debería poder:
- ✅ Guardar credenciales de eBay sin errores del cache
- ✅ Guardar el RuName correctamente (incluso si accidentalmente envía una URL completa)
- ✅ Completar el flujo de OAuth sin problemas

---

## 📊 ANÁLISIS: ¿Por qué seguía apareciendo el error?

### Error del Cache
- **Causa raíz**: La documentación mostraba código "implementado" pero el código real tenía el bug
- **Estado**: El código tenía un comentario indicando que era síncrona, pero seguía llamándose incorrectamente
- **Conclusión**: Bug persistente que nunca se corrigió completamente

### Error del RedirectUri
- **Causa raíz**: Nuevo problema donde se podía enviar una URL completa en lugar del RuName
- **Estado**: No había validación que detectara y corrigiera este caso
- **Conclusión**: Error nuevo que requería validación adicional

---

## 🔍 LECCIONES APRENDIDAS

1. **Verificar implementación real vs documentación**: La documentación puede mostrar código "ideal" pero el código real puede tener bugs
2. **Validar funciones síncronas vs asíncronas**: Siempre verificar el tipo de retorno antes de usar `await` o `.catch()`
3. **Validación defensiva**: Agregar validaciones que detecten y corrijan errores comunes automáticamente
4. **Logging detallado**: Los logs ayudaron a identificar exactamente dónde ocurrían los errores

---

**Fecha de corrección**: 2025-11-15  
**Revisado por**: Auto (AI Assistant)  
**Estado**: ✅ Completado

