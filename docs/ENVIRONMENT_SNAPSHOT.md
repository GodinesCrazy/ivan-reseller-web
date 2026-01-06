# 📸 ENVIRONMENT SNAPSHOT - v1.0.0

**Fecha:** 2025-01-26  
**Propósito:** Documentar configuración esperada sin exponer valores sensibles

---

## 🌐 VERCEL (Frontend)

### Variables de Entorno Esperadas

#### ✅ Configuración Correcta
```env
# NO configurar VITE_API_URL (o configurar como "/api")
# El sistema usa automáticamente /api proxy en producción
```

#### ❌ Configuración Incorrecta
```env
# NO hacer esto:
VITE_API_URL=https://ivan-reseller-web-production.up.railway.app

# Esto causará warnings y problemas de CORS
```

### Configuración de Proyecto

**Root Directory:** Vacío (no `frontend/`)  
**Build Command:** `cd frontend && npm run build`  
**Output Directory:** `frontend/dist`  
**Framework Preset:** Vite

### Rewrites (vercel.json)

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

**Nota:** `/aliexpress/callback` NO está en rewrites porque se maneja por serverless function.

### Serverless Functions

**Ubicación:** `api/aliexpress/callback.ts`  
**Ruta Final:** `/api/aliexpress/callback`  
**Función:** Proxy al backend de Railway para OAuth callback

---

## 🚂 RAILWAY (Backend)

### Variables de Entorno Esperadas

#### ✅ Configuración Crítica

```env
# CORS
CORS_ORIGIN=https://www.ivanreseller.com

# Base URL del Frontend
WEB_BASE_URL=https://www.ivanreseller.com

# Entorno
NODE_ENV=production

# Base de Datos
DATABASE_URL=postgresql://... (configurado por Railway)

# Redis (opcional)
REDIS_URL=redis://... (si está configurado)
```

#### ✅ Configuración de AliExpress OAuth

```env
# AliExpress Dropshipping OAuth
ALIEXPRESS_DROPSHIPPING_APP_KEY=... (valor real)
ALIEXPRESS_DROPSHIPPING_APP_SECRET=... (valor real)
ALIEXPRESS_DROPSHIPPING_REDIRECT_URI=https://www.ivanreseller.com/api/aliexpress/callback
```

**Nota:** Los valores reales NO deben documentarse aquí por seguridad.

#### ✅ Otras APIs (Opcionales)

```env
# eBay
EBAY_APP_ID=...
EBAY_DEV_ID=...
EBAY_CERT_ID=...

# Amazon
AMAZON_CLIENT_ID=...
AMAZON_CLIENT_SECRET=...

# MercadoLibre
MERCADOLIBRE_CLIENT_ID=...
MERCADOLIBRE_CLIENT_SECRET=...

# PayPal
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...

# ScraperAPI
SCRAPERAPI_KEY=...

# ZenRows
ZENROWS_API_KEY=...

# GROQ
GROQ_API_KEY=...

# 2Captcha
2CAPTCHA_API_KEY=...
```

**Nota:** Todas estas son opcionales y se configuran según necesidad.

---

## 🔗 USO CORRECTO DE /API PROXY

### Cómo Funciona

1. Frontend hace request a `/api/health`
2. Vercel rewrite redirige a `https://ivan-reseller-web-production.up.railway.app/api/health`
3. Railway backend procesa la request
4. Response vuelve al frontend

### Ventajas

- ✅ Same-origin (no hay problemas de CORS)
- ✅ Cookies httpOnly funcionan correctamente
- ✅ No necesita configuración de CORS en frontend
- ✅ Funciona automáticamente en producción

### ⚠️ ADVERTENCIAS EXPLÍCITAS

#### ❌ NO Definir VITE_API_URL como URL Absoluta en Producción

**Por qué:**
- Causa problemas de CORS
- Las cookies httpOnly no funcionan correctamente
- El sistema ya funciona correctamente con `/api` proxy

**Qué hacer:**
- NO configurar `VITE_API_URL` en Vercel Dashboard
- O configurarla como `/api` (ruta relativa)

**Cómo verificar:**
- Ejecutar `npm run smoke:prod`
- Verificar que no hay warnings en consola
- Verificar que requests funcionan correctamente

---

## 🔐 SEGURIDAD

### Variables Sensibles

**NUNCA documentar valores reales de:**
- API Keys
- Client Secrets
- Database URLs con credenciales
- Tokens de acceso

### Mejores Prácticas

1. ✅ Usar variables de entorno para todos los secretos
2. ✅ No commitear `.env` files
3. ✅ Usar Railway Secrets para valores sensibles
4. ✅ Rotar credenciales periódicamente
5. ✅ Usar diferentes credenciales para desarrollo y producción

---

## 📊 VALIDACIÓN DE CONFIGURACIÓN

### Comandos de Verificación

```bash
# Verificar que frontend compila
cd frontend
npm run build

# Verificar que backend inicia
cd backend
npm run dev

# Verificar producción
npm run smoke:prod
```

### Checklist de Configuración

**Vercel:**
- [ ] Root Directory está vacío
- [ ] Build Command es correcto
- [ ] Output Directory es correcto
- [ ] `VITE_API_URL` NO está configurada (o es `/api`)
- [ ] `vercel.json` está en la raíz

**Railway:**
- [ ] `CORS_ORIGIN` está configurado
- [ ] `WEB_BASE_URL` está configurado
- [ ] `NODE_ENV` es `production`
- [ ] `DATABASE_URL` está configurado
- [ ] Credenciales de AliExpress están configuradas

**AliExpress App Console:**
- [ ] Redirect URI es `https://www.ivanreseller.com/api/aliexpress/callback`
- [ ] App Key y App Secret son correctos

---

## 🔄 ACTUALIZACIÓN DE CONFIGURACIÓN

### Si se Agrega Nueva Variable

1. Documentar en este archivo (sin valor real)
2. Agregar a Railway Secrets
3. Actualizar código si es necesario
4. Validar con smoke tests

### Si se Cambia Variable Existente

1. Actualizar en Railway
2. Verificar que no rompe funcionalidad existente
3. Ejecutar smoke tests
4. Actualizar documentación si es necesario

---

## 📝 NOTAS IMPORTANTES

### Dominio Canónico

**Siempre usar:** `https://www.ivanreseller.com`  
**NO usar:** `https://ivanreseller.com` (sin www)

**Por qué:**
- Previene problemas de cookies
- Previene problemas de OAuth state
- Consistencia en toda la aplicación

### Proxy de Vercel

**Siempre usar:** `/api` (ruta relativa)  
**NO usar:** URL absoluta a Railway

**Por qué:**
- Evita problemas de CORS
- Permite cookies httpOnly
- Funciona automáticamente

---

## 🎯 RESUMEN

### Configuración Mínima Requerida

**Vercel:**
- Root Directory vacío
- Build Command correcto
- NO `VITE_API_URL` absoluta

**Railway:**
- `CORS_ORIGIN`
- `WEB_BASE_URL`
- `NODE_ENV=production`
- `DATABASE_URL`
- Credenciales de AliExpress (si se usa OAuth)

**AliExpress App Console:**
- Redirect URI correcto

### Configuración Opcional

- Redis (para cache)
- Otras APIs (eBay, Amazon, etc.)
- Variables de logging

---

**Fecha de creación:** 2025-01-26  
**Versión:** v1.0.0  
**Última actualización:** 2025-01-26

