# 🔍 GUÍA DE MONITOREO - RAILWAY DEPLOYMENT

**Fecha:** 2025-01-14  
**URL de Producción:** `https://ivan-reseller-web-production.up.railway.app`

---

## ✅ VERIFICACIÓN MANUAL DEL DEPLOYMENT

### 1. Verificar en Railway Dashboard

1. **Ir a:** https://railway.app
2. **Seleccionar proyecto:** `ivan-reseller`
3. **Seleccionar servicio:** `ivan-reseller-web`
4. **Verificar estado:**
   - ✅ Status debe ser "Active" (verde)
   - ✅ Último deployment debe mostrar commit `1407041` o más reciente
   - ✅ No debe haber errores en "Deploy Logs"

### 2. Revisar Build Logs

En Railway Dashboard → Tu servicio → "Deploy Logs":

**Buscar:**
- ✅ `✔ Generated Prisma Client` (Prisma generado correctamente)
- ✅ Sin errores de TypeScript
- ✅ Sin errores de `MODULE_NOT_FOUND`
- ✅ Build completado exitosamente

### 3. Revisar Runtime Logs

En Railway Dashboard → Tu servicio → "Logs":

**Buscar:**
- ✅ `✅ LISTEN_CALLBACK - HTTP SERVER LISTENING`
- ✅ `✅ Database migrations completed` (después de unos segundos)
- ✅ Sin errores `Cannot find module './api/routes/setup-status.routes'`
- ✅ Sin crashes del servidor

---

## 🔧 VERIFICACIÓN DE ENDPOINTS

### Test 1: Health Endpoint (Básico)

```bash
curl https://ivan-reseller-web-production.up.railway.app/health
```

**Respuesta esperada:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-14T...",
  "uptime": 123.456,
  "service": "ivan-reseller-backend"
}
```

**Si falla:**
- El servidor no ha arrancado todavía
- Espera 30-60 segundos después del deployment
- Verifica logs en Railway Dashboard

### Test 2: API Health Endpoint

```bash
curl https://ivan-reseller-web-production.up.railway.app/api/health
```

**Respuesta esperada:**
```json
{
  "status": "healthy",
  "timestamp": "...",
  "uptime": 123.456,
  "service": "ivan-reseller-backend",
  "environment": "production"
}
```

### Test 3: Setup Status Endpoint (NUEVO - debe existir ahora)

```bash
curl https://ivan-reseller-web-production.up.railway.app/api/setup-status
```

**Respuestas esperadas:**
- ✅ **401 Unauthorized** = Endpoint existe pero requiere autenticación (CORRECTO)
- ❌ **404 Not Found** = Endpoint no existe (el fix no funcionó)

**Si retorna 404:**
- El deployment no incluyó el fix del import descomentado
- Verifica que el commit `1407041` o más reciente está desplegado
- Revisa los logs del build para ver si hay errores

### Test 4: AliExpress Token Status Endpoint

```bash
curl https://ivan-reseller-web-production.up.railway.app/api/aliexpress/token-status
```

**Respuestas esperadas:**
- ✅ **200 OK** = Endpoint funciona correctamente
- ❌ **404 Not Found** = Endpoint no existe (problema de routing)

---

## 📊 MONITOREO AUTOMATIZADO

### Script PowerShell

Ejecutar el script de monitoreo:

```powershell
.\scripts\monitor_railway_deployment.ps1
```

Este script:
- Intenta conectar al servidor cada 10 segundos
- Verifica los 4 endpoints principales
- Muestra un resumen del estado del deployment
- Se detiene cuando el servidor responde correctamente

### Monitoreo Manual con curl

Puedes ejecutar estos comandos manualmente:

```bash
# Health check
curl -s https://ivan-reseller-web-production.up.railway.app/health | jq .

# API Health
curl -s https://ivan-reseller-web-production.up.railway.app/api/health | jq .

# Setup Status (debe dar 401, no 404)
curl -s -w "\nStatus: %{http_code}\n" https://ivan-reseller-web-production.up.railway.app/api/setup-status

# AliExpress Token Status
curl -s https://ivan-reseller-web-production.up.railway.app/api/aliexpress/token-status | jq .
```

---

## 🚨 TROUBLESHOOTING

### Problema: Health endpoint no responde

**Posibles causas:**
1. El deployment todavía está en proceso (espera 1-2 minutos)
2. El servidor crasheó al arrancar (revisa logs)
3. Error en el build (revisa Build Logs)

**Solución:**
- Revisa los "Deploy Logs" en Railway Dashboard
- Busca errores de compilación o runtime
- Verifica que el commit correcto está desplegado

### Problema: Error "Cannot find module './api/routes/setup-status.routes'"

**Causa:**
- El import está comentado en el código compilado
- O el archivo no se está compilando correctamente

**Solución:**
- Verifica que el commit `1407041` o más reciente está desplegado
- Verifica que `backend/src/app.ts` tiene el import descomentado:
  ```typescript
  import setupStatusRoutes from './api/routes/setup-status.routes';
  ```
- Verifica que el build no tiene errores

### Problema: /api/setup-status retorna 404

**Causa:**
- El fix no se aplicó correctamente
- El deployment no incluyó los últimos cambios

**Solución:**
- Verifica que el commit más reciente incluye el fix
- Fuerza un nuevo deployment en Railway (Settings → Redeploy)
- Revisa que el archivo `setup-status.routes.ts` existe en `backend/src/api/routes/`

---

## Capacidad del volumen de Postgres

Si el volumen de PostgreSQL en Railway (p. ej. `postgres-volume-kWVb`) muestra aviso de capacidad o el disco está lleno, consulta la guía dedicada: [RAILWAY_POSTGRES_CAPACITY.md](RAILWAY_POSTGRES_CAPACITY.md). Incluye pasos para **Live resize** en el Dashboard, buenas prácticas y cómo ejecutar el script de mantenimiento `VACUUM ANALYZE` desde el backend.

---

## ✅ CHECKLIST DE VERIFICACIÓN

### Pre-Deployment
- [x] Código commiteado y pusheado
- [x] Build local pasa sin errores
- [x] Import de `setup-status.routes` descomentado
- [x] Railway config actualizada (`railway.json`)

### Durante Deployment
- [ ] Railway detecta el nuevo commit
- [ ] Build pasa sin errores
- [ ] No hay errores `MODULE_NOT_FOUND`
- [ ] Prisma Client se genera correctamente

### Post-Deployment
- [ ] Servidor arranca sin crashes
- [ ] Health endpoint responde 200
- [ ] API health endpoint responde 200
- [ ] Setup status endpoint existe (401, no 404)
- [ ] AliExpress token status endpoint responde (200 o 401, no 404)
- [ ] Logs muestran "✅ LISTEN_CALLBACK - HTTP SERVER LISTENING"
- [ ] Logs no muestran errores de módulos faltantes

---

## 📝 NOTAS

- El deployment en Railway suele tardar 2-5 minutos
- El servidor puede tardar 10-30 segundos en responder después del deployment
- Si el healthcheck falla, Railway puede reiniciar el deployment automáticamente
- Los logs en Railway se actualizan en tiempo real

---

**Última actualización:** 2025-01-14  
**Commit de referencia:** `1407041` - Fix de `setup-status.routes` MODULE_NOT_FOUND

