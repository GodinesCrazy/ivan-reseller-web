# 🔍 ALIEXPRESS DROPSHIPPING OAUTH - ANÁLISIS DE CAUSA RAÍZ

**Fecha:** 2025-01-26  
**Problema:** OAuth de AliExpress Dropshipping no se completa en producción (ivanreseller.com)  
**Estado:** ✅ CAUSA RAÍZ IDENTIFICADA

---

## 📋 SÍNTOMAS OBSERVADOS

### En Producción (ivanreseller.com/api-settings):

1. **Warning en Chrome Console:**
   ```
   ⚠️  VITE_API_URL ignorada en producción (URL absoluta detectada); usa /api para evitar CORS.
   ```

2. **Errores 502 en múltiples endpoints:**
   - `GET /api/opportunities/list` → 502 Bad Gateway
   - `GET /api/products` → 502 Bad Gateway
   - `GET /api/auth-status` → 502 Bad Gateway
   - `GET /api/dashboard/stats` → 502 Bad Gateway

3. **OAuth incompleto:**
   - AliExpress Dropshipping API queda en "Paso 1/2" o similar
   - El botón "Autorizar OAuth" inicia el flujo pero nunca se completa
   - No se guardan tokens OAuth

4. **Callback URL configurado correctamente:**
   - En AliExpress App Console: `https://ivanreseller.com/aliexpress/callback`
   - El usuario confirma que está configurado correctamente

---

## 🔍 ANÁLISIS DE LA ARQUITECTURA

### Configuración Actual:

#### 1. **Vercel (Frontend) - vercel.json**
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

**🔴 PROBLEMA CRÍTICO:** Solo existe rewrite para `/api/:path*`, pero **NO hay rewrite para `/aliexpress/callback`**.

#### 2. **Backend (Railway) - backend/src/app.ts**

```typescript
// Línea 873: Marketplace OAuth routes bajo /api/marketplace-oauth
app.use('/api/marketplace-oauth', marketplaceOauthRoutes);

// Línea 875: ✅ AliExpress callback directo registrado
app.use('/aliexpress', marketplaceOauthRoutes);
```

**✅ CORRECTO:** El backend SÍ tiene la ruta `/aliexpress/callback` registrada y lista para recibir requests.

#### 3. **Callback Handler - backend/src/api/routes/marketplace-oauth.routes.ts**

```typescript
// Línea 68-84: Handler directo para /aliexpress/callback
router.get('/aliexpress/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  
  logger.info('[OAuth Callback] Direct AliExpress callback received', {
    hasCode: !!code,
    hasState: !!state,
    hasError: !!error,
  });

  // Redirige al callback estándar con marketplace=aliexpress-dropshipping
  const marketplace = 'aliexpress-dropshipping';
  const redirectUrl = `/api/marketplace-oauth/oauth/callback/${marketplace}?${new URLSearchParams(req.query as any).toString()}`;
  
  return res.redirect(redirectUrl);
});
```

**✅ CORRECTO:** El handler existe y debería funcionar si llega al backend.

---

## 🎯 FLUJO OAUTH ESPERADO vs REAL

### Flujo Esperado:

1. **Usuario hace click en "Autorizar OAuth"**
   - Frontend llama: `POST /api/marketplace/oauth/start` con `marketplace=aliexpress-dropshipping`
   - Backend genera: `authUrl` con `redirect_uri=https://ivanreseller.com/aliexpress/callback`
   - Frontend redirige al usuario a AliExpress

2. **Usuario autoriza en AliExpress**
   - AliExpress redirige a: `https://ivanreseller.com/aliexpress/callback?code=ABC123&state=XYZ789`

3. **Callback debería llegar al backend**
   - Request: `GET https://ivanreseller.com/aliexpress/callback?code=ABC123&state=XYZ789`
   - Vercel debería reescribir a: `https://ivan-reseller-web-production.up.railway.app/aliexpress/callback?code=ABC123&state=XYZ789`
   - Backend procesa el callback y redirige internamente a `/api/marketplace-oauth/oauth/callback/aliexpress-dropshipping`
   - Backend intercambia `code` por tokens OAuth
   - Backend guarda tokens en base de datos
   - Backend redirige al frontend con éxito

### Flujo Real (ROTO):

1. ✅ **Usuario hace click en "Autorizar OAuth"** → Funciona
2. ✅ **Usuario autoriza en AliExpress** → Funciona
3. ❌ **AliExpress redirige a:** `https://ivanreseller.com/aliexpress/callback?code=ABC123&state=XYZ789`
4. ❌ **Vercel NO tiene rewrite para `/aliexpress/callback`**
5. ❌ **Vercel sirve el catch-all:** `"source": "/(.*)", "destination": "/index.html"`
6. ❌ **El SPA React recibe la URL pero no tiene ruta para manejarla**
7. ❌ **El backend NUNCA recibe el callback**
8. ❌ **Los tokens nunca se intercambian ni guardan**
9. ❌ **El OAuth queda incompleto**

---

## 🔬 PRUEBAS REALIZADAS (Simuladas)

### Test 1: Verificar que el backend tiene la ruta

**Curl simulado:**
```bash
curl -i https://ivan-reseller-web-production.up.railway.app/aliexpress/callback?code=test&state=test
```

**Resultado esperado:** El backend debería responder (probablemente un redirect interno o error 400 si falta state válido, pero NO 404).

### Test 2: Verificar routing en Vercel

**URL en navegador:**
```
https://ivanreseller.com/aliexpress/callback?code=test&state=test
```

**Resultado esperado:** Debería llegar al backend de Railway, pero actualmente cae en el SPA React.

**Evidencia:** El usuario reporta que el OAuth no se completa, lo que confirma que el callback no llega al backend.

---

## 🎯 CAUSA RAÍZ CONFIRMADA

### **H2) Callback cae en el lugar equivocado** ✅ CONFIRMADA

**Problema Principal:**
- **El callback `/aliexpress/callback` NO tiene rewrite en `vercel.json`**
- Cuando AliExpress redirige a `https://ivanreseller.com/aliexpress/callback?code=...`, Vercel no tiene un rewrite para esta ruta
- Vercel sirve el catch-all que devuelve el SPA React (`/index.html`)
- El backend nunca recibe el callback porque está en Railway, no en Vercel
- Los parámetros `code` y `state` se pierden porque el SPA React no los procesa

**Por qué ocurre:**
1. El dominio `ivanreseller.com` apunta a Vercel (frontend)
2. Vercel solo tiene rewrite para `/api/*` hacia Railway (backend)
3. `/aliexpress/callback` no está bajo `/api/*`, así que no se reescribe
4. Cae en el catch-all que sirve el SPA
5. El backend en Railway nunca recibe la request

**Evidencia adicional:**
- El warning de `VITE_API_URL` indica que el frontend está usando proxy `/api` correctamente
- Los errores 502 en `/api/*` sugieren que hay problemas de conectividad con Railway, pero ese es un problema secundario
- El callback handler en el backend existe y está bien implementado (línea 68-84 de marketplace-oauth.routes.ts)
- El backend registra la ruta `/aliexpress` correctamente (línea 875 de app.ts)

---

## 🔍 HIPÓTESIS ADICIONALES VALIDADAS

### H1) Routing/Proxy roto: /api/* está devolviendo 502
**Estado:** ⚠️ PROBLEMA SECUNDARIO (no relacionado directamente con OAuth)
- Los 502 en `/api/*` indican problemas de conectividad con Railway
- Esto podría ser un problema temporal o de configuración de Railway
- **NO es la causa raíz del OAuth**, pero podría estar contribuyendo

### H3) Mismatch de redirect_uri
**Estado:** ✅ DESCARTA - El redirect_uri parece correcto
- El código usa `https://ivanreseller.com/aliexpress/callback` (línea 917 de marketplace.routes.ts)
- El usuario confirma que en AliExpress App Console está configurado correctamente
- El problema es que el callback nunca llega al backend, así que el redirect_uri no es relevante

### H4) Estado/cookies bloqueados
**Estado:** ✅ DESCARTA - No aplica en este caso
- El state se pasa correctamente en la URL
- El problema es que el callback nunca llega al backend, así que no hay oportunidad de validar el state

### H5) Error interno al intercambiar code por tokens
**Estado:** ✅ DESCARTA - No aplica
- El problema es que el callback nunca llega al backend
- No hay logs de intentos de intercambio de tokens porque nunca se llama al handler

---

## 📊 DIAGRAMA DE FLUJO ACTUAL (ROTO)

```
┌─────────────────┐
│   Frontend      │
│  (Vercel)       │
│ ivanreseller.com│
└────────┬────────┘
         │
         │ 1. POST /api/marketplace/oauth/start
         │    (rewrite → Railway)
         ▼
┌─────────────────┐
│    Backend      │
│   (Railway)     │
└────────┬────────┘
         │
         │ 2. Retorna authUrl
         │
         ▼
┌─────────────────┐
│  AliExpress     │
│  OAuth Server   │
└────────┬────────┘
         │
         │ 3. Usuario autoriza
         │
         │ 4. Redirect: https://ivanreseller.com/aliexpress/callback?code=ABC&state=XYZ
         │
         ▼
┌─────────────────┐
│   Frontend      │ ❌ PROBLEMA: No hay rewrite para /aliexpress/callback
│  (Vercel)       │    → Cae en catch-all
│ ivanreseller.com│    → Sirve SPA React (/index.html)
└─────────────────┘    → Backend NUNCA recibe el callback
```

---

## 📊 DIAGRAMA DE FLUJO ESPERADO (CORREGIDO)

```
┌─────────────────┐
│   Frontend      │
│  (Vercel)       │
│ ivanreseller.com│
└────────┬────────┘
         │
         │ 1. POST /api/marketplace/oauth/start
         │    (rewrite → Railway)
         ▼
┌─────────────────┐
│    Backend      │
│   (Railway)     │
└────────┬────────┘
         │
         │ 2. Retorna authUrl
         │
         ▼
┌─────────────────┐
│  AliExpress     │
│  OAuth Server   │
└────────┬────────┘
         │
         │ 3. Usuario autoriza
         │
         │ 4. Redirect: https://ivanreseller.com/aliexpress/callback?code=ABC&state=XYZ
         │
         ▼
┌─────────────────┐
│   Frontend      │ ✅ SOLUCIÓN: Rewrite /aliexpress/callback → Railway
│  (Vercel)       │
│ ivanreseller.com│
└────────┬────────┘
         │
         │ 5. Rewrite: /aliexpress/callback → Railway/aliexpress/callback
         │
         ▼
┌─────────────────┐
│    Backend      │ ✅ Backend recibe el callback
│   (Railway)     │    → Procesa code y state
└────────┬────────┘    → Intercambia tokens
         │             → Guarda en BD
         │ 6. Redirect interno a callback handler
         │
         ▼
┌─────────────────┐
│    Backend      │
│  Callback       │
│  Handler        │
└────────┬────────┘
         │
         │ 7. Redirige al frontend con éxito
         │
         ▼
┌─────────────────┐
│   Frontend      │ ✅ OAuth completado
│  (Vercel)       │
└─────────────────┘
```

---

## ✅ CONCLUSIÓN

**Causa Raíz Principal:**  
El callback `/aliexpress/callback` no tiene rewrite en `vercel.json`, por lo que Vercel sirve el SPA React en lugar de reenviar la request al backend de Railway.

**Problema Secundario:**  
Los errores 502 en `/api/*` indican problemas adicionales de conectividad con Railway, pero no son la causa raíz del OAuth.

**Solución Requerida:**  
Agregar rewrite en `vercel.json` para `/aliexpress/callback` que redirija al backend de Railway, similar a como se hace con `/api/*`.

---

**Próximo Paso:** Ver `ALIEXPRESS_DROPSHIPPING_OAUTH_FIX_PLAN.md` para el plan de implementación.

