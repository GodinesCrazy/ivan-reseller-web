# ✅ CHECKLIST TÉCNICO DE GO-LIVE - Ivan Reseller Web

**Fecha:** 2025-01-26  
**Versión:** v1.0.0  
**Estado:** Pre-Producción

---

## 🎯 OBJETIVO

Este checklist valida que el sistema esté **100% funcional** y listo para uso en producción, basado en el informe técnico de validación.

---

## 📋 CHECKLIST PRE-DEPLOY

### 1. Correcciones de Código

- [x] **Callback URL OAuth corregida**
  - [x] `backend/src/api/routes/marketplace-oauth.routes.ts` línea 265
  - [x] `backend/src/api/routes/marketplace-oauth.routes.ts` línea 839
  - [x] `backend/src/api/routes/marketplace.routes.ts` línea 920
  - [x] Todas usan `/api/aliexpress/callback` (correcto)

- [ ] **Commit y push realizado**
  - [ ] Cambios commiteados con mensaje descriptivo
  - [ ] Push a `origin/main` completado
  - [ ] Deploy en Railway verificado

---

### 2. Configuración de AliExpress Dropshipping OAuth

- [ ] **Callback URL actualizada en AliExpress App Console**
  - [ ] Ir a https://open.aliexpress.com/
  - [ ] Seleccionar aplicación Dropshipping
  - [ ] Cambiar Callback URL de: `https://ivanreseller.com/aliexpress/callback`
  - [ ] A: `https://www.ivanreseller.com/api/aliexpress/callback`
  - [ ] Guardar cambios

- [ ] **Credenciales base configuradas en sistema**
  - [ ] App Key configurado
  - [ ] App Secret configurado
  - [ ] Verificar en Settings → API Settings → AliExpress Dropshipping

- [ ] **OAuth probado en producción**
  - [ ] Click en "Autorizar OAuth" en Settings
  - [ ] Redirección a AliExpress funciona
  - [ ] Callback recibe `code` correctamente
  - [ ] Tokens intercambiados y guardados
  - [ ] Estado muestra "Conectado" (Paso 2/2)

---

### 3. Configuración de AliExpress Affiliate API

- [ ] **Credenciales obtenidas de AliExpress Open Platform**
  - [ ] Registrado en https://open.aliexpress.com/
  - [ ] Aplicación "Affiliate API" creada
  - [ ] App Key obtenido
  - [ ] App Secret obtenido
  - [ ] Tracking ID: `ivanreseller_web` (ya configurado)

- [ ] **Credenciales configuradas en sistema**
  - [ ] Ir a Settings → API Settings → AliExpress Affiliate API
  - [ ] App Key ingresado
  - [ ] App Secret ingresado
  - [ ] Tracking ID verificado
  - [ ] Guardar cambios

- [ ] **Búsqueda de productos probada**
  - [ ] Ir a Oportunidades → Buscar
  - [ ] Ingresar término de búsqueda (ej: "wireless headphones")
  - [ ] Verificar que aparecen resultados
  - [ ] Verificar que precios e imágenes se cargan
  - [ ] Verificar logs en backend: `[ALIEXPRESS-AFFILIATE-API] Request →`

---

### 4. Validación de Infraestructura

- [ ] **Smoke test pasa 6/6**
  - [ ] Ejecutar: `npm run smoke:prod`
  - [ ] Verificar que todos los endpoints pasan
  - [ ] Verificar que `/api/aliexpress/callback` responde correctamente
  - [ ] Revisar `docs/_smoke/last-smoke.json`
  - [ ] Revisar `docs/ALIEXPRESS_DROPSHIPPING_OAUTH_PROD_VALIDATION_REPORT.FILLED.md`

- [ ] **Backend Railway funcionando**
  - [ ] `/api/health` responde 200
  - [ ] `/api/auth-status` responde 200/401 (no 502)
  - [ ] Logs sin errores críticos

- [ ] **Frontend Vercel funcionando**
  - [ ] `https://www.ivanreseller.com` carga correctamente
  - [ ] No hay errores en consola del navegador
  - [ ] No hay warnings técnicos visibles

---

### 5. Validación de Funcionalidad Core

- [ ] **Login y autenticación**
  - [ ] Login funciona correctamente
  - [ ] JWT tokens se generan
  - [ ] Sesión persiste entre recargas

- [ ] **Setup inicial (si aplica)**
  - [ ] Si APIs no configuradas, redirige a `/setup-required`
  - [ ] Pantalla de setup muestra mensaje claro
  - [ ] Después de configurar APIs, redirige a dashboard

- [ ] **Dashboard**
  - [ ] Carga sin errores
  - [ ] Estadísticas se muestran (si APIs configuradas)
  - [ ] No hay popups de error 502

- [ ] **Búsqueda de productos**
  - [ ] Búsqueda funciona (requiere AliExpress Affiliate API)
  - [ ] Resultados se muestran correctamente
  - [ ] Precios e imágenes se cargan

- [ ] **OAuth AliExpress Dropshipping**
  - [ ] Botón "Autorizar OAuth" funciona
  - [ ] Redirección a AliExpress funciona
  - [ ] Callback procesa correctamente
  - [ ] Tokens se guardan
  - [ ] Estado muestra "Conectado"

---

## 🧪 VALIDACIÓN POST-DEPLOY

### Comandos de Verificación

```bash
# 1. Smoke test completo
npm run smoke:prod

# 2. Verificar logs de backend (Railway)
# Ir a Railway Dashboard → Logs
# Buscar: [OAuth Callback], [ALIEXPRESS-AFFILIATE-API]

# 3. Verificar frontend (Vercel)
# Abrir https://www.ivanreseller.com
# Abrir DevTools → Console
# Verificar que no hay errores críticos
```

---

### Endpoints Críticos a Verificar

| Endpoint | Método | Status Esperado | Validación |
|----------|--------|-----------------|------------|
| `/api/health` | GET | 200 | Backend funcionando |
| `/api/auth-status` | GET | 200/401 | No 502 |
| `/api/aliexpress/callback?code=test&state=test` | GET | 200 JSON | Serverless function funciona |
| `/api/setup-status` | GET | 200 | Setup check funciona |
| `/api/products` | GET | 200/401 | No 502 |
| `/api/dashboard/stats` | GET | 200/401 | No 502 |

---

## ⚠️ SEÑALES DE ERROR vs ÉXITO

### ✅ Señales de Éxito

- ✅ Smoke test: `6/6 PASS`
- ✅ OAuth: Estado "Conectado" (Paso 2/2)
- ✅ Búsqueda: Resultados aparecen
- ✅ Dashboard: Carga sin errores
- ✅ Consola: Sin errores críticos
- ✅ Logs backend: `[OAuth Callback] Success`

### ❌ Señales de Error

- ❌ Smoke test: `FAIL` en cualquier endpoint
- ❌ OAuth: Estado "Paso 1/2" (no completa)
- ❌ Búsqueda: "No se encontraron resultados" (siempre)
- ❌ Dashboard: Popups "Backend no disponible (502)"
- ❌ Consola: Errores 502, 404, CORS
- ❌ Logs backend: `[OAuth Callback] Error`

---

## 🔧 TROUBLESHOOTING

### Problema: OAuth no completa

**Síntomas:**
- Estado queda en "Paso 1/2"
- Callback no recibe `code`

**Soluciones:**
1. Verificar Callback URL en AliExpress App Console
2. Verificar que sea: `https://www.ivanreseller.com/api/aliexpress/callback`
3. Verificar logs de backend: `[OAuth Callback]`
4. Verificar que serverless function responde: `curl https://www.ivanreseller.com/api/aliexpress/callback?code=test&state=test`

---

### Problema: Búsqueda no funciona

**Síntomas:**
- No aparecen resultados
- Error: "API credentials not configured"

**Soluciones:**
1. Verificar que AliExpress Affiliate API tiene App Key y App Secret
2. Verificar en Settings → API Settings
3. Verificar logs: `[ALIEXPRESS-AFFILIATE-API] Request →`
4. Si no hay logs, credenciales no están configuradas

---

### Problema: Errores 502 en dashboard

**Síntomas:**
- Popups "Backend no disponible (502)"
- Dashboard no carga datos

**Soluciones:**
1. Verificar que Railway backend está funcionando: `curl https://ivan-reseller-web-production.up.railway.app/api/health`
2. Verificar que `/api/*` proxy en Vercel funciona
3. Verificar logs de Railway para errores
4. Verificar que APIs están configuradas (si no, es normal que devuelva `setupRequired`)

---

## 📝 NOTAS FINALES

### Orden Recomendado de Validación

1. **Primero:** Correcciones de código (callback URL)
2. **Segundo:** Configurar AliExpress Affiliate API
3. **Tercero:** Actualizar Callback URL en AliExpress App Console
4. **Cuarto:** Probar OAuth completo
5. **Quinto:** Probar búsqueda de productos
6. **Sexto:** Ejecutar smoke test completo

### Tiempo Estimado

- Correcciones de código: 5 minutos
- Configurar AliExpress Affiliate API: 20-30 minutos
- Actualizar Callback URL: 2 minutos
- Pruebas completas: 10-15 minutos
- **Total: 40-50 minutos**

---

**Fecha de creación:** 2025-01-26  
**Versión:** v1.0.0  
**Basado en:** `docs/TECHNICAL_VALIDATION_REPORT.md`

