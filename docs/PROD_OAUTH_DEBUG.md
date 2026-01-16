# AliExpress OAuth Debug Report

**Fecha/Hora:** _Ejecutar script para generar reporte completo_  
**Probe Script:** `scripts/prod_oauth_debug_probe.ps1`

---

## Objetivo

Este documento contiene el reporte de debug del problema OAuth de AliExpress en producción:

- **Error:** `param-appkey.not.exists` / `appkey不存在`
- **Endpoint afectado:** `https://www.ivanreseller.com/api/aliexpress/auth`
- **Deploy actual:** X-App-Commit `5f55392`

---

## Resumen Ejecutivo

_Esto se completará al ejecutar el script `scripts/prod_oauth_debug_probe.ps1`_

---

## Cómo Generar el Reporte

1. **Configurar DEBUG_KEY en Railway:**
   ```bash
   # En Railway Dashboard → Variables → Agregar:
   DEBUG_KEY=<tu-clave-secreta-debug>
   ```

2. **Ejecutar el probe script:**
   ```powershell
   # Desde el directorio raíz del proyecto
   $env:DEBUG_KEY = "<tu-clave-debug>"
   .\scripts\prod_oauth_debug_probe.ps1
   ```

3. **El reporte se generará automáticamente:**
   - Archivo: `docs/PROD_OAUTH_DEBUG.md`
   - Contiene evidencia completa de AppKey usado
   - Análisis de root cause
   - Próximos pasos recomendados

---

## Endpoints Debug Disponibles

### 1. `/api/aliexpress/oauth-debug` (GET)
**Protegido:** Requiere header `X-Debug-Key` en producción

**Respuesta (ejemplo):**
```json
{
  "success": true,
  "data": {
    "appKeyMasked": "5248**80",
    "appKeyLength": 6,
    "hasAppKey": true,
    "hasAppSecret": true,
    "callbackUrl": "https://www.ivanreseller.com/api/aliexpress/callback",
    "envSource": "env.ts",
    "oauthAuthorizeUrlSanitized": "https://oauth.aliexpress.com/authorize?response_type=code&client_id=524880&redirect_uri=...&state=...&scope=api",
    "environment": "production"
  }
}
```

### 2. `/api/aliexpress/auth` (GET)
**Público:** Redirige a AliExpress OAuth

**Comportamiento esperado:**
- Status: `302 Found`
- Location header contiene URL de OAuth con `client_id=524880`

---

## Validación de AppKey

### AppKey Esperado
- **Valor:** `524880`
- **Tipo:** AliExpress Affiliates
- **Configurado en:** Railway → Variables → `ALIEXPRESS_APP_KEY`

### AppKeys Históricos
- **DropShipping:** `522578` (NO usar para OAuth)
- **Affiliates:** `524880` (CORRECTO para OAuth)

---

## Posibles Root Causes

### 1. AppKey Incorrecto en Backend ❌
**Síntomas:**
- Debug endpoint muestra AppKey diferente a `524880`
- Redirect contiene `client_id` incorrecto

**Solución:**
- Verificar `ALIEXPRESS_APP_KEY` en Railway = `524880`
- Reiniciar servicio después de cambiar variable

### 2. AppKey No Activada en AliExpress ❌
**Síntomas:**
- AppKey correcto (`524880`) en redirect
- Error `param-appkey.not.exists` persiste

**Solución:**
- Verificar en [AliExpress Affiliate Program](https://portals.aliexpress.com/)
- Completar proceso "Apply Online"
- Verificar permisos OAuth habilitados

### 3. Callback URL Mismatch ❌
**Síntomas:**
- AppKey correcto pero callback no coincide

**Solución:**
- Verificar `ALIEXPRESS_CALLBACK_URL` en Railway
- Debe ser: `https://www.ivanreseller.com/api/aliexpress/callback`
- Registrar callback URL en AliExpress Dashboard

---

## Logging Mejorado

El endpoint `/api/aliexpress/auth` ahora incluye logging seguro:

```
[AliExpress OAuth] Redirect URL generated
  correlationId: oauth-1234567890-abc123
  appKeyMasked: 5248**80
  appKeyLength: 6
  callbackUrl: https://www.ivanreseller.com/api/aliexpress/callback
  baseUrl: https://www.ivanreseller.com
  authUrlSanitized: https://oauth.aliexpress.com/authorize?response_type=code&client_id=524880&redirect_uri=...&state=...&scope=api
  envSource: env.ts
```

**Nota:** Los secretos están mascarados automáticamente.

---

## Próximos Pasos

1. **Ejecutar probe script** para obtener evidencia actual
2. **Analizar reporte generado** para determinar root cause
3. **Aplicar fix** según root cause identificado:
   - Si AppKey incorrecto → Actualizar en Railway
   - Si AppKey correcto → Proceder con configuración AliExpress
4. **Re-validar** con probe script después de fix
5. **Monitorear logs** en Railway para confirmar OAuth exitoso

---

## Referencias

- **AliExpress Affiliate API:** [Documentación Oficial](https://developers.aliexpress.com/en/doc.htm?docId=118&docType=1)
- **Railway Dashboard:** [Variables de Entorno](https://railway.app/dashboard)
- **Endpoint OAuth:** `/api/aliexpress/auth`
- **Endpoint Callback:** `/api/aliexpress/callback`
- **Endpoint Debug:** `/api/aliexpress/oauth-debug`

---

*Última actualización: Ejecutar probe script para reporte actualizado*

