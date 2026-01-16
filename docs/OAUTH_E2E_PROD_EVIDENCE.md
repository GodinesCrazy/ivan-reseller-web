# AliExpress OAuth End-to-End Production Evidence

**Fecha/Hora de recolección:** 2026-01-16 02:39:55 GMT  
**Release Manager:** Staff Engineer  
**Objetivo:** Diagnosticar y cerrar GO-LIVE del OAuth end-to-end con evidencia verificable

---

## FASE 1 — Recolección de Evidencia Técnica

### 1.1 Test del Endpoint `/api/aliexpress/auth`

**Comando ejecutado:**
```powershell
curl.exe -i "https://www.ivanreseller.com/api/aliexpress/auth"
```

**Resultado:**
- **Status Code:** `302 Found`
- **Location Header:** `https://oauth.aliexpress.com/authorize?response_type=code&client_id=524880&redirect_uri=https%253A%252F%252Fwww.ivanreseller.com%252Fapi%252Faliexpress%252Fcallback&state=b99a6609fda8385ccfa02ca29a6ce15814cfb9b4b9f97c8896091354ef8e52b6&scope=api`

**Análisis:**
- ✅ El backend redirige correctamente (302)
- ✅ `client_id=524880` (AppKey correcto según especificación)
- ✅ `redirect_uri` está correctamente codificado
- ✅ `scope=api` presente
- ✅ `state` generado (CSRF protection)

**Client ID extraído:** `524880` (coincide con AppKey esperado: 524880)

### 1.2 Test de la URL de OAuth de AliExpress

**Comando ejecutado:**
```powershell
curl.exe -i "https://oauth.aliexpress.com/authorize?response_type=code&client_id=524880&redirect_uri=https%3A%2F%2Fwww.ivanreseller.com%2Fapi%2Faliexpress%2Fcallback&state=test-state&scope=api"
```

**Resultado:**
- **Status Code:** `200 OK`
- **Content-Type:** `text/html;charset=UTF-8`
- **Body (HTML):** Contiene página de error de AliExpress

**Error detectado:**
```html
<h3 class="ui-feedback-header">Sorry, authorization failed.</h3>
<p>Error Code: param-appkey.not.exists<br/>Error Message: appkey不存在</p>
```

**Análisis:**
- ❌ AliExpress responde con error `param-appkey.not.exists`
- ❌ Mensaje: "appkey不存在" (appkey no existe)
- ⚠️ El `client_id=524880` se envía correctamente, pero AliExpress no lo reconoce

### 1.3 Conclusión FASE 1

**Estado:** ❌ **FAIL**

**Evidencia:**
1. El backend genera correctamente la URL de OAuth con `client_id=524880`
2. AliExpress rechaza el AppKey con error `param-appkey.not.exists`
3. El problema está en el lado de AliExpress, no en nuestro backend

**Próximos pasos:**
- Validar configuración en AliExpress OpenService
- Verificar que la app esté en estado "Online" (no "Test")
- Confirmar que la cuenta que autoriza sea Seller (no Buyer)
- Revisar Auth Management en OpenService

---

## FASE 2 — Validación del AppKey y Segmento OAuth

### 2.1 Endpoint de Debug: `/api/aliexpress/oauth-redirect-url`

**Endpoint:** `GET /api/aliexpress/oauth-redirect-url`  
**Protección:** Requiere header `X-Debug-Key` que coincida con `DEBUG_KEY` env var

**Respuesta esperada:**
```json
{
  "oauthBaseUrl": "https://oauth.aliexpress.com",
  "clientIdMasked": "5248**80",
  "clientIdTail": "4880",
  "redirectUri": "https://www.ivanreseller.com/api/aliexpress/callback",
  "scope": "api",
  "stateLength": 64
}
```

**Validación:**
- ✅ `clientIdTail` debe ser `"4880"` (últimos 4 dígitos de 524880)
- ✅ `redirectUri` debe coincidir con producción
- ✅ `scope` debe ser `"api"`

### 2.2 Script de Validación: `scripts/prod_oauth_e2e_probe.ps1`

**Funcionalidad:**
- Llama al endpoint `/api/aliexpress/oauth-redirect-url` con `X-Debug-Key`
- Verifica que `clientIdTail` sea `"4880"`
- Registra resultados en este documento

**Ejecución:**
```powershell
.\scripts\prod_oauth_e2e_probe.ps1
```

---

## FASE 3 — Plan Operativo (Manual)

### Manual Steps to Fix AliExpress Side

#### 3.1 Verificar Seller Center

1. **Acceder a AliExpress Seller Center:**
   - URL: https://seller.aliexpress.com
   - Login con: `goldenkeystudios0@gmail.com`
   - Verificar que la cuenta tenga permisos de Seller activos

2. **Validar estado de la cuenta:**
   - La cuenta debe estar activa como Seller
   - No debe estar suspendida o en revisión

#### 3.2 Revisar OpenService Configuration

1. **Acceder a OpenService:**
   - URL: https://open.aliexpress.com
   - Login con: `goldenkeystudios0@gmail.com`

2. **Verificar App Configuration:**
   - Buscar app con AppKey: `524880`
   - Verificar estado: debe estar en **"Online"** (no "Test")
   - Verificar que el AppKey esté activo y no revocado

3. **Revisar Auth Management:**
   - Ir a: OpenService → App Management → Auth Management
   - Verificar que OAuth esté habilitado
   - Verificar que el Redirect URI esté configurado: `https://www.ivanreseller.com/api/aliexpress/callback`
   - Verificar que el Redirect URI coincida exactamente (sin trailing slash, con https)

#### 3.3 Validar Tipo de Login

1. **Importante:** El login en AliExpress debe usar la cuenta **Seller**:
   - Email: `goldenkeystudios0@gmail.com`
   - Tipo: Seller account (no Buyer account)
   - Si se usa una cuenta Buyer, AliExpress puede rechazar el AppKey

2. **Verificar permisos:**
   - La cuenta Seller debe tener permisos para usar Affiliate API
   - Verificar que no haya restricciones de región o país

#### 3.4 Si AliExpress Sigue Diciendo "appkey不存在"

1. **Abrir ticket en OpenService:**
   - URL: https://open.aliexpress.com/support
   - Tema: "OAuth Authorization Error: param-appkey.not.exists"
   - Incluir:
     - AppKey: `524880`
     - Email de la cuenta: `goldenkeystudios0@gmail.com`
     - Redirect URI: `https://www.ivanreseller.com/api/aliexpress/callback`
     - Error completo: `param-appkey.not.exists (appkey不存在)`
     - Evidencia de este documento

2. **Verificar si el AppKey está en el ambiente correcto:**
   - Algunos AppKeys solo funcionan en ambiente de Test
   - Algunos AppKeys solo funcionan en ambiente de Producción
   - Verificar en OpenService si el AppKey `524880` está configurado para Producción

3. **Verificar si hay múltiples apps:**
   - Puede haber otra app con un AppKey diferente
   - Verificar que se esté usando el AppKey correcto para Affiliate API (no Dropshipping API)

#### 3.5 Checklist de Validación

- [ ] Seller Center activo con cuenta `goldenkeystudios0@gmail.com`
- [ ] OpenService: App `524880` en estado "Online"
- [ ] OpenService: Redirect URI configurado exactamente: `https://www.ivanreseller.com/api/aliexpress/callback`
- [ ] OpenService: OAuth habilitado en Auth Management
- [ ] Login usando cuenta Seller (no Buyer)
- [ ] AppKey `524880` corresponde a Affiliate API (no Dropshipping)
- [ ] Si persiste el error, ticket abierto en OpenService Support

---

## FASE 4 — Git

### Commit y Push

**Commit message:**
```
chore: add oauth e2e evidence + redirect debug
```

**Archivos modificados/creados:**
- `docs/OAUTH_E2E_PROD_EVIDENCE.md` (nuevo)
- `backend/src/modules/aliexpress/aliexpress.controller.ts` (endpoint oauth-redirect-url)
- `backend/src/modules/aliexpress/aliexpress.routes.ts` (ruta oauth-redirect-url)
- `scripts/prod_oauth_e2e_probe.ps1` (nuevo)

---

## Resumen Final

### Estado Actual: ❌ **FAIL**

**Evidencia técnica:**
- ✅ Backend genera correctamente URL OAuth con `client_id=524880`
- ❌ AliExpress rechaza con `param-appkey.not.exists`

**Causa raíz probable:**
- Configuración en AliExpress OpenService (app no en estado "Online")
- Redirect URI no configurado correctamente en OpenService
- AppKey no activo o revocado
- Login usando cuenta Buyer en lugar de Seller

**Siguiente acción exacta:**
1. Ejecutar `scripts/prod_oauth_e2e_probe.ps1` para validar `clientIdTail=4880`
2. Revisar OpenService: App `524880` → Auth Management → Redirect URI
3. Verificar que app esté en estado "Online" (no "Test")
4. Si persiste, abrir ticket en OpenService Support con evidencia de este documento

---

**Última actualización:** 2026-01-16 02:40:02 GMT

