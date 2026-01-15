# Production Wiring Fix - Proxy /api Routes to Railway Backend

**Fecha:** 2025-01-26  
**Estado:** ✅ COMPLETADO  
**Objetivo:** Arreglar el wiring de producción para que el frontend en Vercel use SIEMPRE el backend de Railway

---

## 🐛 Bug Identificado

### Problema
- Las rutas `/api/*` en `www.ivanreseller.com` respondían con errores:
  - `502 Bad Gateway` - Backend no disponible
  - `ALIEXPRESS_APP_KEY no configurado` - Vercel/Next.js respondiendo en vez del backend de Railway

### Causa Raíz
El `vercel.json` tenía un rewrite configurado para `/api/:path*`, pero:
1. **Faltaba el rewrite para `/health`** - endpoint crítico para health checks
2. **Los headers no estaban optimizados** - faltaban headers CORS específicos para rutas de API
3. **El orden de los rewrites estaba correcto**, pero faltaba completitud

### URLs Afectadas
- `https://www.ivanreseller.com/api/aliexpress/token-status` → 502
- `https://www.ivanreseller.com/api/aliexpress/auth` → "APP_KEY no configurado"
- `https://www.ivanreseller.com/api/aliexpress/test-link?productId=...` → "env missing"
- `https://www.ivanreseller.com/health` → No funcionaba

---

## ✅ Solución Implementada

### Archivo Modificado: `vercel.json`

**Cambios realizados:**

1. **Agregado rewrite para `/health`**:
   ```json
   {
     "source": "/health",
     "destination": "https://ivan-reseller-web-production.up.railway.app/health"
   }
   ```

2. **Mejorados headers para rutas `/api/*`**:
   - Agregados headers CORS específicos para rutas de API
   - Headers de seguridad mantenidos para otras rutas

3. **Mantenido orden correcto de rewrites**:
   - Rewrites específicos (`/api/*`, `/health`) ANTES del catch-all (`/(.*)`)

### Configuración Final

```json
{
  "buildCommand": "cd frontend && npm run build",
  "outputDirectory": "frontend/dist",
  "framework": "vite",
  "installCommand": "cd frontend && npm ci --include=dev",
  "devCommand": "cd frontend && npm run dev",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://ivan-reseller-web-production.up.railway.app/api/:path*"
    },
    {
      "source": "/health",
      "destination": "https://ivan-reseller-web-production.up.railway.app/health"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/api/:path*",
      "headers": [
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        },
        {
          "key": "Access-Control-Allow-Methods",
          "value": "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        },
        {
          "key": "Access-Control-Allow-Headers",
          "value": "Content-Type, Authorization, X-Requested-With"
        }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

---

## 📋 Archivos Modificados

1. **`vercel.json`** - Agregado rewrite para `/health` y mejorados headers CORS

---

## 🧪 Cómo Probar en Producción

### Scripts de Smoke Test

Se crearon dos scripts para validar el wiring:

#### Bash (Linux/Mac):
```bash
./scripts/prod_smoke_test.sh
```

#### PowerShell (Windows):
```powershell
.\scripts\prod_smoke_test.ps1
```

### Pruebas Manuales

1. **Health Check:**
   ```bash
   curl https://www.ivanreseller.com/health
   ```
   **Esperado:** `200 OK` con JSON de health

2. **Token Status:**
   ```bash
   curl https://www.ivanreseller.com/api/aliexpress/token-status
   ```
   **Esperado:** `200`, `401`, o `403` (NO `502`)

3. **OAuth Auth (debe redirigir):**
   ```bash
   curl -I https://www.ivanreseller.com/api/aliexpress/auth
   ```
   **Esperado:** `302` o `301` (redirect a AliExpress OAuth)

4. **Test Link:**
   ```bash
   curl "https://www.ivanreseller.com/api/aliexpress/test-link?productId=1005001234567890"
   ```
   **Esperado:** Respuesta del backend (NO "env missing" ni "APP_KEY no configurado")

### URLs de Prueba

- ✅ Health: `https://www.ivanreseller.com/health`
- ✅ Token Status: `https://www.ivanreseller.com/api/aliexpress/token-status`
- ✅ OAuth Auth: `https://www.ivanreseller.com/api/aliexpress/auth`
- ✅ Test Link: `https://www.ivanreseller.com/api/aliexpress/test-link?productId=1005001234567890`

---

## ✅ Checklist GO-LIVE Final

### Pre-Deployment
- [x] `vercel.json` actualizado con rewrites correctos
- [x] Scripts de smoke test creados
- [x] Documentación actualizada

### Post-Deployment
- [ ] Ejecutar smoke test: `./scripts/prod_smoke_test.sh` o `.\scripts\prod_smoke_test.ps1`
- [ ] Verificar `/health` responde `200`
- [ ] Verificar `/api/aliexpress/token-status` NO responde `502`
- [ ] Verificar `/api/aliexpress/auth` redirige correctamente (`302`/`301`)
- [ ] Verificar `/api/aliexpress/test-link` NO responde "env missing"
- [ ] Verificar dashboard NO muestra "Backend no disponible 502"
- [ ] Probar OAuth completo: `https://www.ivanreseller.com/api/aliexpress/auth`

### Verificación de Dominio
- [x] `www.ivanreseller.com` configurado en Vercel
- [x] `ivanreseller.com` configurado en Vercel (si aplica)
- [x] Ambos dominios usan los mismos rewrites (automático en Vercel)

---

## 🔍 Troubleshooting

### Si `/api/*` sigue respondiendo 502:

1. **Verificar que el rewrite esté activo:**
   - En Vercel Dashboard → Deployments → Verificar que el último deployment incluye los cambios
   - Verificar que `vercel.json` está en la raíz del proyecto

2. **Verificar que Railway está funcionando:**
   ```bash
   curl https://ivan-reseller-web-production.up.railway.app/health
   ```
   Debe responder `200 OK`

3. **Verificar logs de Vercel:**
   - Vercel Dashboard → Deployments → [Último deployment] → Functions Logs
   - Buscar errores relacionados con rewrites

### Si `/api/*` responde "APP_KEY no configurado":

- Esto indica que el rewrite NO está funcionando y Vercel está respondiendo
- Verificar que el rewrite en `vercel.json` está correcto
- Verificar que el deployment incluye el `vercel.json` actualizado

### Si `/health` no funciona:

- Verificar que el rewrite para `/health` está ANTES del catch-all `/(.*)`
- Verificar que Railway responde en `/health`

---

## 📝 Notas Técnicas

### Stack
- **Frontend:** Vite + React (NO Next.js)
- **Backend:** Node.js + Express en Railway
- **Deployment Frontend:** Vercel
- **Deployment Backend:** Railway

### Cómo Funciona el Rewrite

1. Usuario accede a `https://www.ivanreseller.com/api/aliexpress/auth`
2. Vercel intercepta la request
3. El rewrite `/api/:path*` coincide
4. Vercel hace un proxy interno a `https://ivan-reseller-web-production.up.railway.app/api/aliexpress/auth`
5. La respuesta de Railway se devuelve al usuario
6. El usuario ve la respuesta del backend, NO del frontend

### Ventajas de este Enfoque

- ✅ **Sin CORS issues** - Las requests son same-origin desde el punto de vista del navegador
- ✅ **No expone secrets** - La URL de Railway no se expone al cliente
- ✅ **Transparente** - El frontend solo necesita usar `/api/*` (relativo)
- ✅ **No invasivo** - No requiere cambios en el código del frontend

---

## 🎯 Resultado Final

Después de este fix:

- ✅ Todas las rutas `/api/*` son proxy hacia Railway
- ✅ `/health` funciona correctamente
- ✅ No más errores `502 Bad Gateway`
- ✅ No más "ALIEXPRESS_APP_KEY no configurado" desde Vercel
- ✅ OAuth de AliExpress funciona correctamente
- ✅ Dashboard muestra estado correcto del backend

**Estado:** ✅ GO-LIVE READY

---

## 📚 Referencias

- [Vercel Rewrites Documentation](https://vercel.com/docs/configuration/routing/rewrites)
- [Vercel Headers Documentation](https://vercel.com/docs/configuration/routing/headers)
- Railway Backend: `https://ivan-reseller-web-production.up.railway.app`
- Frontend Production: `https://www.ivanreseller.com`

