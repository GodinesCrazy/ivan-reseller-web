# 🔗 ALIEXPRESS DROPSHIPPING OAUTH - DOMINIO CANÓNICO

**Fecha:** 2025-01-26  
**Problema:** Saltos de dominio entre ivanreseller.com y www.ivanreseller.com durante OAuth  
**Solución:** Usar dominio canónico consistente (www.ivanreseller.com)  
**Estado:** ✅ IMPLEMENTADO

---

## 📋 PROBLEMA

### ¿Qué pasaba?

1. **Vercel canonical domain redirect:**
   - `ivanreseller.com` → `www.ivanreseller.com` (307 redirect)
   - Esto causa que las URLs sin `www` sean redirigidas automáticamente

2. **OAuth con salto de dominio:**
   - Si el `redirect_uri` se construía con `https://ivanreseller.com/aliexpress/callback`
   - Y AliExpress redirigía a esa URL
   - Vercel hacía redirect 307 a `https://www.ivanreseller.com/aliexpress/callback`
   - **Riesgo:** Pérdida de cookies/state durante el redirect entre dominios

3. **Impacto:**
   - Cookies de sesión pueden no transferirse correctamente
   - State de OAuth puede perderse
   - OAuth puede fallar silenciosamente

---

## ✅ SOLUCIÓN IMPLEMENTADA

### Variable de Entorno: `WEB_BASE_URL`

**Ubicación:** `backend/src/config/env.ts`

**Definición:**
```typescript
WEB_BASE_URL: z.string().url().optional(), // Base URL for OAuth callbacks (defaults to www.ivanreseller.com in production)
```

**Default en producción:**
- `https://www.ivanreseller.com` (si `NODE_ENV === 'production'`)

**Default en desarrollo:**
- `http://localhost:5173` (si no está configurado)

---

### Cambios en el Código

#### 1. **Construcción de redirect_uri en marketplace.routes.ts**

**Antes:**
```typescript
const callbackUrl = typeof redirect_uri === 'string' && redirect_uri.length > 0
  ? redirect_uri
  : credTemp?.credentials?.redirectUri || process.env.ALIEXPRESS_DROPSHIPPING_REDIRECT_URI || '';
```

**Después:**
```typescript
const webBaseUrl = process.env.WEB_BASE_URL || 
                  (process.env.NODE_ENV === 'production' ? 'https://www.ivanreseller.com' : 'http://localhost:5173');
const defaultCallbackUrl = `${webBaseUrl}/aliexpress/callback`;

const callbackUrl = typeof redirect_uri === 'string' && redirect_uri.length > 0
  ? redirect_uri
  : credTemp?.credentials?.redirectUri || process.env.ALIEXPRESS_DROPSHIPPING_REDIRECT_URI || defaultCallbackUrl;
```

#### 2. **Fallback en exchangeCodeForToken en marketplace-oauth.routes.ts**

**Antes:**
```typescript
redirectUri || 'https://ivanreseller.com/aliexpress/callback'
```

**Después:**
```typescript
const webBaseUrl = process.env.WEB_BASE_URL || 
                  (process.env.NODE_ENV === 'production' ? 'https://www.ivanreseller.com' : 'http://localhost:5173');
const defaultCallbackUrl = `${webBaseUrl}/aliexpress/callback`;

redirectUri || defaultCallbackUrl
```

---

## 🔧 CONFIGURACIÓN

### En Railway (Producción)

**Variable de Entorno:**
```env
WEB_BASE_URL=https://www.ivanreseller.com
```

**Nota:** Si no se configura, el código usa `https://www.ivanreseller.com` como default en producción.

### En Desarrollo Local

**Variable de Entorno (opcional):**
```env
WEB_BASE_URL=http://localhost:5173
```

**Nota:** Si no se configura, el código usa `http://localhost:5173` como default en desarrollo.

---

## 📝 IMPORTANCIA PARA OAUTH

### ¿Por qué es importante usar el mismo dominio?

1. **Cookies Same-Origin Policy:**
   - Las cookies solo se comparten dentro del mismo dominio
   - `ivanreseller.com` y `www.ivanreseller.com` son técnicamente diferentes dominios
   - Aunque los navegadores modernos manejan redirects, puede haber problemas con cookies httpOnly

2. **State de OAuth:**
   - El state se almacena en cookies o session storage
   - Si hay un redirect de dominio, el state puede perderse
   - Esto causa que el OAuth falle en la validación del state

3. **Consistencia:**
   - Usar siempre el mismo dominio canónico (www) evita problemas
   - AliExpress verifica que el redirect_uri coincida exactamente con el configurado
   - Si AliExpress redirige a `ivanreseller.com` pero está configurado `www.ivanreseller.com`, fallará

---

## ✅ RESULTADO

- ✅ **Dominio canónico consistente:** Siempre usa `www.ivanreseller.com` en producción
- ✅ **Sin saltos de dominio:** El redirect_uri ya apunta al dominio correcto
- ✅ **OAuth más robusto:** Menor riesgo de pérdida de cookies/state
- ✅ **Configurable:** Se puede cambiar con `WEB_BASE_URL` si es necesario

---

## 🔍 VALIDACIÓN

### Smoke Test

El smoke test ahora:
- ✅ Sigue redirects automáticamente
- ✅ Evalúa el resultado FINAL después de redirects
- ✅ Muestra la cadena de redirects en los logs
- ✅ Incluye `finalUrl` y `redirectChain` en el JSON report

### Verificación Manual

1. **Verificar variable en Railway:**
   - Railway Dashboard → Variables → `WEB_BASE_URL`
   - Debe ser: `https://www.ivanreseller.com` (o dejar sin configurar para usar default)

2. **Verificar logs del OAuth:**
   - Buscar en logs: `[AliExpress Dropshipping OAuth] Generating authorization URL`
   - Verificar que `callbackUrl` contiene `www.ivanreseller.com` (no solo `ivanreseller.com`)

3. **Verificar en AliExpress App Console:**
   - Callback URL configurado debe ser: `https://www.ivanreseller.com/aliexpress/callback`
   - Debe coincidir exactamente con el usado en el código

---

**Estado:** ✅ IMPLEMENTADO Y DOCUMENTADO

