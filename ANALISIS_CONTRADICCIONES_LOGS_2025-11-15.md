# 🔍 ANÁLISIS DE CONTRADICCIONES EN LOGS - 2025-11-15

**Fecha**: 2025-11-15  
**Usuario**: cona (userId: 41) / admin (durante configuración)  
**Problema**: Múltiples contradicciones entre el estado visual y los logs del sistema

---

## 📋 RESUMEN DE CONTRADICCIONES ENCONTRADAS

### ❌ CONTRADICCIÓN 1: OAuth Exitoso vs Error en UI

**Evidencia Visual**:
- ✅ eBay muestra: "Autorización completada correctamente" (`isAuthSuccessful=true`)
- ❌ Aplicación muestra: "Error: eBay account info error: Resource not found"

**Análisis**:
- El OAuth de eBay se completó exitosamente
- PERO el sistema no puede obtener la información de la cuenta de eBay
- Esto sugiere que el token OAuth no se está guardando o intercambiando correctamente

**Causa Probable**:
- El callback de OAuth no está procesando el código de autorización
- O el intercambio de código por token está fallando
- O el token se guarda pero no se valida correctamente

---

### ❌ CONTRADICCIÓN 2: redirectUri con Formatos Incorrectos

**Log 08:42:32**:
```
"redirectUri":"https://signin.sandbox.ebay.com/ws/eBayISAPI.dll?SignIn&runame=Constanza_Santa-Constanz-ivanre-blbcfwx&SessID=<SESSION_ID>"
Error: "redirectUri: Redirect URI contains invalid characters"
```

**Problema**:
- Se está guardando una URL completa de signin de eBay
- Nuestra validación solo detectaba `auth.sandbox.ebay.com` y `auth.ebay.com`
- NO detectaba `signin.sandbox.ebay.com` (URL legacy de eBay SignIn)

**Solución Implementada**:
- ✅ Agregada detección de `signin.sandbox.ebay.com` y `signin.ebay.com`
- ✅ Agregada extracción del parámetro `runame` (legacy) además de `redirect_uri`

---

### ❌ CONTRADICCIÓN 3: redirectUri con Prefijo "redirect_uri="

**Log 08:46:48**:
```
"redirectUri":"redirect_uri=Constanza_Santa-Constanz-ivarne-blbcfwx"
```

**Problema**:
- Alguien copió/pegó un parámetro de URL con el prefijo `redirect_uri=`
- El sistema no limpiaba este prefijo antes de validar
- Causaba que el RuName tuviera caracteres inválidos (`=` y `redirect_uri`)

**Solución Implementada**:
- ✅ Agregada limpieza automática del prefijo `redirect_uri=`
- ✅ El sistema ahora detecta y remueve este prefijo antes de validar

---

### ❌ CONTRADICCIÓN 4: Error del Cache Persiste

**Logs 08:46:48 y 08:48:31**:
```
Error invalidating cache after saving credentials
error: "Cannot read properties of undefined (reading 'catch')"
```

**Problema**:
- El error del cache que corregimos sigue apareciendo
- Esto significa que el código corregido NO se ha desplegado aún en producción

**Estado**:
- ✅ Código corregido en repositorio
- ❌ Código NO desplegado en producción (Railway)
- ⚠️ Necesita redeploy para aplicar la corrección

---

### ❌ CONTRADICCIÓN 5: redirectUri Correcto pero Sin Token OAuth

**Log 08:48:31**:
```
"redirectUri":"Constanza_Santa-Constanz-ivarne-blbcfwx"
warn: "Credentials validation failed for ebay - Falta token OAuth de eBay"
```

**Análisis**:
- El `redirectUri` finalmente está correcto
- PERO sigue sin token OAuth
- El OAuth se completó visualmente pero el token no se guardó

**Causa Probable**:
- El callback de OAuth no está procesando el código correctamente
- O el intercambio de código por token está fallando silenciosamente
- O hay un problema con el endpoint de callback de OAuth

---

## 🔧 CORRECCIONES IMPLEMENTADAS

### 1. Mejora de Validación de redirectUri

**Archivo**: `backend/src/services/credentials-manager.service.ts`

**Cambios**:
1. ✅ Detección de `signin.sandbox.ebay.com` y `signin.ebay.com` (URLs legacy)
2. ✅ Extracción del parámetro `runame` (legacy) además de `redirect_uri`
3. ✅ Limpieza automática del prefijo `redirect_uri=`
4. ✅ Mejor logging para diagnosticar problemas

**Código**:
```typescript
// Limpiar prefijo redirect_uri= si existe
if (creds.redirectUri.startsWith('redirect_uri=')) {
  creds.redirectUri = creds.redirectUri.replace(/^redirect_uri=/, '').trim();
}

// Detectar URLs de eBay (incluyendo signin.sandbox.ebay.com)
const isEbayUrl = creds.redirectUri.includes('signin.sandbox.ebay.com') || 
                  creds.redirectUri.includes('signin.ebay.com') ||
                  creds.redirectUri.includes('auth.sandbox.ebay.com') || 
                  creds.redirectUri.includes('auth.ebay.com');

// Extraer RuName de redirect_uri o runame
const extractedRuName = url.searchParams.get('redirect_uri') || 
                        url.searchParams.get('runame');
```

---

## ⚠️ PROBLEMAS PENDIENTES

### 1. OAuth Callback No Procesa Token

**Síntoma**:
- OAuth se completa exitosamente en eBay
- Pero el token no se guarda en el sistema
- UI muestra error "Resource not found"

**Acción Requerida**:
- Verificar endpoint de callback de OAuth (`/api/marketplace/oauth/callback`)
- Verificar que el código de autorización se intercambie por token
- Verificar que el token se guarde correctamente

### 2. Código Corregido No Desplegado

**Síntoma**:
- Error del cache sigue apareciendo en logs
- Código corregido existe en repositorio
- Pero no está en producción

**Acción Requerida**:
- Hacer redeploy del backend en Railway
- Verificar que el código corregido esté en producción

---

## 📊 RESUMEN DE ESTADO

| Problema | Estado | Acción |
|----------|--------|--------|
| redirectUri con URL signin | ✅ Corregido | Desplegar |
| redirectUri con prefijo redirect_uri= | ✅ Corregido | Desplegar |
| Error del cache | ✅ Corregido | ⚠️ **Desplegar** |
| OAuth callback no procesa token | ❌ Pendiente | Investigar |
| Token OAuth no se guarda | ❌ Pendiente | Investigar |

---

## 🎯 PRÓXIMOS PASOS

1. **URGENTE**: Hacer redeploy del backend para aplicar correcciones
2. **URGENTE**: Investigar por qué el callback de OAuth no procesa el token
3. **MEDIO**: Verificar que el endpoint de callback esté funcionando correctamente
4. **BAJO**: Agregar más logging al flujo de OAuth para diagnosticar

---

**Fecha de análisis**: 2025-11-15  
**Revisado por**: Auto (AI Assistant)  
**Estado**: ⚠️ Requiere redeploy e investigación adicional

