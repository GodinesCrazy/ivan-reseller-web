# 🔧 ALIEXPRESS DROPSHIPPING OAUTH - PLAN DE FIX

**Fecha:** 2025-01-26  
**Problema:** OAuth de AliExpress Dropshipping no se completa en producción  
**Causa Raíz:** Callback `/aliexpress/callback` no tiene rewrite en `vercel.json`  
**Estado:** 📋 PLAN LISTO PARA IMPLEMENTACIÓN

---

## 🎯 OBJETIVO

Corregir el routing para que el callback `/aliexpress/callback` llegue correctamente al backend de Railway, permitiendo que el flujo OAuth se complete exitosamente.

---

## 📋 FIX MÍNIMO RECOMENDADO (MVP)

### **Opción A: Agregar Rewrite en vercel.json** ⭐ RECOMENDADA

**Ventajas:**
- ✅ Solución más simple y directa
- ✅ Consistente con el patrón existente (`/api/*`)
- ✅ No requiere cambios en el código del backend
- ✅ No requiere cambios en el código del frontend
- ✅ Mantiene la separación frontend/backend

**Desventajas:**
- ⚠️ Requiere redeploy de Vercel (automático al hacer push)

**Implementación:**
Agregar un rewrite en `vercel.json` para `/aliexpress/callback` que redirija al backend de Railway.

---

## 🔧 CAMBIOS PROPUESTOS

### **1. Modificar `vercel.json`**

**Archivo:** `vercel.json`

**Cambio:**
Agregar un rewrite para `/aliexpress/callback` antes del catch-all.

**Antes:**
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://ivan-reseller-web-production.up.railway.app/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Después:**
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://ivan-reseller-web-production.up.railway.app/api/:path*"
    },
    {
      "source": "/aliexpress/callback",
      "destination": "https://ivan-reseller-web-production.up.railway.app/aliexpress/callback"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Nota:** El orden es crítico. El rewrite de `/aliexpress/callback` debe ir **ANTES** del catch-all `"/(.*)"` para que tenga prioridad.

---

### **2. Agregar Endpoint de Diagnóstico (Opcional pero Recomendado)**

**Archivo:** `backend/src/api/routes/marketplace-oauth.routes.ts`

**Objetivo:** Crear un endpoint que permita verificar el estado del OAuth sin exponer información sensible.

**Endpoint:** `GET /api/aliexpress/oauth/debug`

**Respuesta esperada:**
```json
{
  "callbackReachable": true,
  "hasTokens": false,
  "environment": "production",
  "lastError": null,
  "lastAuthAt": null,
  "status": "not_authorized"
}
```

**Implementación:**
```typescript
router.get('/aliexpress/oauth/debug', async (req: Request, res: Response) => {
  try {
    // Verificar que el callback es accesible (simulando que llegamos aquí)
    const callbackReachable = true;
    
    // Obtener información del usuario si está autenticado
    // Nota: Este endpoint debería ser público o con auth opcional para debugging
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.json({
        callbackReachable: true,
        hasTokens: false,
        environment: 'unknown',
        lastError: null,
        lastAuthAt: null,
        status: 'not_authenticated',
        message: 'User not authenticated'
      });
    }
    
    // Obtener credenciales de AliExpress Dropshipping
    const { CredentialsManager } = await import('../../services/credentials-manager.service');
    const cred = await CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', 'production');
    
    const hasTokens = !!(cred?.accessToken || cred?.token);
    
    return res.json({
      callbackReachable: true,
      hasTokens,
      environment: cred?.environment || 'production',
      lastError: null, // Se puede extender para loggear últimos errores
      lastAuthAt: cred?.updatedAt || null,
      status: hasTokens ? 'authorized' : 'not_authorized'
    });
  } catch (error: any) {
    logger.error('[AliExpress OAuth Debug] Error', {
      error: error.message
    });
    
    return res.status(500).json({
      callbackReachable: true,
      hasTokens: false,
      environment: 'unknown',
      lastError: error.message,
      lastAuthAt: null,
      status: 'error'
    });
  }
});
```

**Nota:** Este endpoint puede ser útil para debugging, pero debería considerarse si es necesario o si se prefiere usar los logs del backend directamente.

---

## 🚨 RIESGOS Y MITIGACIÓN

### **Riesgo 1: El backend de Railway no está disponible**
**Probabilidad:** Media  
**Impacto:** Alto  
**Mitigación:**
- Verificar que Railway esté funcionando antes de hacer el fix
- Los errores 502 en `/api/*` deberían investigarse primero
- Considerar agregar health checks

### **Riesgo 2: El rewrite interfiere con otras rutas**
**Probabilidad:** Baja  
**Impacto:** Medio  
**Mitigación:**
- El rewrite es específico (`/aliexpress/callback`), no usa wildcards
- No debería afectar otras rutas
- Verificar en staging/preview antes de producción

### **Riesgo 3: Cambio de URL del backend de Railway**
**Probabilidad:** Baja  
**Impacto:** Alto  
**Mitigación:**
- Usar variable de entorno para la URL del backend (pero Vercel no permite fácilmente)
- Documentar la dependencia de la URL hardcodeada
- Considerar usar un dominio personalizado para el backend en el futuro

### **Riesgo 4: El callback handler del backend tiene bugs**
**Probabilidad:** Baja  
**Impacto:** Medio  
**Mitigación:**
- El código del handler parece correcto según la revisión
- Agregar logging adicional si es necesario
- Probar en sandbox primero

---

## ✅ CHECKLIST DE VERIFICACIÓN POST-FIX

### **Pre-Deploy:**
- [ ] Modificar `vercel.json` con el nuevo rewrite
- [ ] Verificar sintaxis JSON correcta
- [ ] Commit y push a repositorio
- [ ] Verificar que Vercel detecta el cambio y inicia redeploy

### **Post-Deploy Vercel:**
- [ ] Verificar que el deploy de Vercel fue exitoso
- [ ] Probar que `/api/health` sigue funcionando (verificar conectividad con Railway)
- [ ] Probar que `/api/auth-status` funciona (si Railway está disponible)
- [ ] Verificar que otras rutas del frontend siguen funcionando

### **Verificación del Callback:**
- [ ] **Test Manual 1:** Abrir `https://ivanreseller.com/aliexpress/callback?code=test&state=test` en navegador
  - ✅ Debería redirigir a Railway y mostrar respuesta del backend (no el SPA React)
  - ✅ Si el backend responde, debería ver un error 400 o similar (porque code/state son inválidos), pero NO una página del SPA
- [ ] **Test Manual 2:** Usar curl para verificar el rewrite:
  ```bash
  curl -i "https://ivanreseller.com/aliexpress/callback?code=test&state=test" -H "Host: ivanreseller.com"
  ```
  - ✅ Debería ver headers/response del backend de Railway, no del SPA

### **Verificación del OAuth Completo:**
- [ ] Ir a `https://ivanreseller.com/api-settings`
- [ ] Encontrar "AliExpress Dropshipping API"
- [ ] Hacer click en "Autorizar OAuth" (o botón similar)
- [ ] Completar el flujo de autorización en AliExpress
- [ ] Verificar que después de autorizar, el callback funciona:
  - ✅ El navegador redirige correctamente
  - ✅ No aparece página 404 o SPA React
  - ✅ El OAuth se completa (Paso 2/2 o similar)
  - ✅ Los tokens se guardan correctamente

### **Verificación de Endpoints 502:**
- [ ] Verificar que `/api/health` responde correctamente
- [ ] Verificar que `/api/auth-status` responde correctamente (sin 502)
- [ ] Verificar que `/api/dashboard/stats` responde correctamente (sin 502)
- [ ] Verificar que `/api/products` responde correctamente (sin 502)
- [ ] Si siguen dando 502, investigar problemas de Railway (problema separado)

### **Verificación de Logs:**
- [ ] Revisar logs de Railway para ver requests a `/aliexpress/callback`
- [ ] Verificar que los logs muestran el callback recibido
- [ ] Verificar que no hay errores en el procesamiento del callback
- [ ] Verificar que los tokens se guardan correctamente

---

## 🔄 VALIDACIÓN EN SANDBOX Y PRODUCCIÓN

### **Sandbox (si aplica):**
1. Configurar AliExpress App Console con callback: `https://[preview-url].vercel.app/aliexpress/callback`
2. Probar el flujo OAuth completo
3. Verificar que funciona correctamente

### **Producción:**
1. El callback ya está configurado: `https://ivanreseller.com/aliexpress/callback`
2. Probar el flujo OAuth completo
3. Verificar que los tokens se guardan
4. Verificar que `/api/auth-status` refleja el estado correcto

---

## 📝 NOTAS ADICIONALES

### **¿Por qué no mover el callback bajo /api/?**

**Opción considerada pero descartada:**
- Cambiar el callback a `/api/aliexpress/callback` y actualizar AliExpress App Console

**Razones para descartar:**
- ❌ Requiere cambio en AliExpress App Console (el usuario ya lo tiene configurado)
- ❌ Podría romper otras integraciones existentes
- ❌ Agregar rewrite es más simple y no rompe nada

### **Futuras Mejoras:**
1. **Variable de entorno para backend URL:**
   - Usar variable de entorno en `vercel.json` (pero Vercel no lo soporta nativamente)
   - Considerar usar un dominio personalizado para el backend (`api.ivanreseller.com`)

2. **Health checks automáticos:**
   - Agregar endpoint de health check que verifique conectividad con Railway
   - Monitoreo automático de disponibilidad

3. **Logging mejorado:**
   - Agregar más logging en el callback handler
   - Trackear métricas de éxito/fallo del OAuth

---

## 🚀 ORDEN DE IMPLEMENTACIÓN

1. **Fase 1: Fix Principal (MVP)**
   - ✅ Modificar `vercel.json`
   - ✅ Commit y push
   - ✅ Esperar redeploy de Vercel
   - ✅ Verificar que el callback llega al backend

2. **Fase 2: Validación**
   - ✅ Probar el flujo OAuth completo
   - ✅ Verificar que los tokens se guardan
   - ✅ Verificar que `/api/auth-status` funciona

3. **Fase 3: Endpoint de Diagnóstico (Opcional)**
   - ⚠️ Implementar si se considera necesario
   - ⚠️ Agregar a la documentación

---

**Estado:** ✅ PLAN LISTO - Esperando aprobación para implementación

