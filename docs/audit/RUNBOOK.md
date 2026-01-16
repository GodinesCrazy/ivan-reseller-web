# 📘 RUNBOOK - OPERACIÓN EN PRODUCCIÓN

**Fecha:** 2025-01-28  
**Tipo:** Manual de Operación y Troubleshooting  
**Estado:** ✅ COMPLETADO

---

## 📋 ÍNDICE

1. [Despliegue](#despliegue)
2. [Rollback](#rollback)
3. [Incident Response](#incident-response)
4. [Monitoreo y Health Checks](#monitoreo-y-health-checks)
5. [Mantenimiento de Base de Datos](#mantenimiento-de-base-de-datos)

---

## 🚀 DESPLIEGUE

### Railway (Backend)

#### Despliegue Automático (GitHub)

1. **Push a GitHub:**
   ```bash
   git add .
   git commit -m "feat: descripción del cambio"
   git push origin main
   ```

2. **Railway detecta automáticamente** el push y inicia deployment

3. **Monitorear deployment:**
   - Railway Dashboard → `ivan-reseller-web` → Deployments
   - Ver logs en tiempo real
   - Esperar mensaje: `✅ Server running on port XXXX`

#### Despliegue Manual

1. Railway Dashboard → `ivan-reseller-web` → Deployments
2. Click en "Redeploy" del deployment actual
3. Monitorear logs

#### Verificación Post-Deploy

1. **Health Check:**
   ```bash
   curl https://ivan-reseller-web-production.up.railway.app/health
   # Debe responder: {"status":"healthy",...}
   ```

2. **Readiness Check:**
   ```bash
   curl https://ivan-reseller-web-production.up.railway.app/ready
   # Debe responder: {"status":"ready",...}
   ```

3. **Verificar logs:**
   - Railway Dashboard → Deployments → Último deployment → Logs
   - Buscar errores o warnings críticos

---

## ⏪ ROLLBACK

### Railway

1. **Railway Dashboard** → `ivan-reseller-web` → Deployments
2. **Buscar deployment anterior** que funcionaba correctamente
3. **Click en el deployment** → "Redeploy"
4. **Confirmar** redeploy del deployment anterior
5. **Monitorear** que el deployment anterior se active correctamente

**Nota:** Railway mantiene historial de deployments, puedes volver a cualquier versión anterior.

---

## 🚨 INCIDENT RESPONSE

### Qué Revisar Primero

1. **Health Endpoints:**
   - `GET /health` - ¿El proceso está corriendo?
   - `GET /ready` - ¿DB y Redis están disponibles?
   - `GET /api/system/health/detailed` - Estado detallado (requiere auth)

2. **Logs:**
   - Railway Dashboard → Deployments → Último deployment → Logs
   - Buscar: `ERROR`, `FATAL`, `UNCAUGHT EXCEPTION`
   - Buscar correlation IDs para rastrear requests específicos

3. **Métricas:**
   - Railway Dashboard → Metrics
   - CPU, Memoria, Red
   - Verificar si hay picos anómalos

### Errores Comunes

#### Database Connection Error

**Síntomas:**
- Logs muestran: `P1000: Authentication failed` o `ECONNREFUSED`
- Health check `/ready` falla

**Solución:**
1. Verificar que `DATABASE_URL` está configurada en Railway Variables
2. Verificar que servicio PostgreSQL está corriendo
3. Copiar `DATABASE_URL` desde PostgreSQL service → Variables → DATABASE_URL
4. Pegar en `ivan-reseller-web` → Variables → DATABASE_URL
5. Redeploy backend

#### CORS Errors

**Síntomas:**
- Frontend muestra errores CORS en consola
- Requests fallan con "CORS policy: origin not allowed"

**Solución:**
1. Verificar `CORS_ORIGIN` o `CORS_ORIGINS` en Railway Variables
2. Asegurar que incluye el origen del frontend (ej: `https://www.ivanreseller.com`)
3. Usar endpoint de debug: `GET /api/cors-debug` para diagnosticar
4. Redeploy backend

#### JWT/Encryption Key Error

**Síntomas:**
- Logs muestran: `ENCRYPTION_KEY validation failed`
- Servidor no inicia

**Solución:**
1. Verificar que `JWT_SECRET` tiene mínimo 32 caracteres
2. Verificar que `ENCRYPTION_KEY` tiene mínimo 32 caracteres (o usa JWT_SECRET como fallback)
3. Generar nuevo secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. Actualizar en Railway Variables
5. Redeploy backend

#### High Memory Usage

**Síntomas:**
- Railway muestra uso de memoria alto (>80%)
- Servidor se reinicia frecuentemente

**Solución:**
1. Revisar logs para identificar memory leaks
2. Verificar jobs en background (BullMQ) - pueden acumularse si Redis falla
3. Considerar upgrade de plan Railway
4. Revisar código para memory leaks (Puppeteer sin cerrar, conexiones DB sin cerrar)

---

## 📊 MONITOREO Y HEALTH CHECKS

### Health Endpoints

| Endpoint | Propósito | Auth | Uso |
|----------|-----------|------|-----|
| `GET /health` | Liveness probe | No | Kubernetes/Railway health checks |
| `GET /api/health` | Liveness probe con CORS | No | Frontend health checks |
| `GET /ready` | Readiness probe | No | Verifica DB + Redis |
| `GET /api/system/health/detailed` | Health detallado | Sí | Diagnóstico avanzado |
| `GET /api/cors-debug` | Debug CORS | No | Diagnosticar problemas CORS |
| `GET /config` | Config sanitizada | No | Verificar configuración (sin secretos) |
| `GET /version` | Info de build | No | Verificar versión desplegada |

### Monitoreo Recomendado

1. **Health Checks Automáticos:**
   - Railway: Automático cada 30s
   - Externo: Usar servicio de monitoring (UptimeRobot, Pingdom, etc.)
   - Endpoint: `GET /health` cada 1-5 minutos

2. **Logs:**
   - Railway Dashboard → Deployments → Logs (tiempo real)
   - Buscar correlation IDs para rastrear requests específicos
   - Niveles: `error`, `warn`, `info`, `debug`

3. **Métricas:**
   - Railway Dashboard → Metrics
   - CPU, Memoria, Red
   - Alertas si CPU > 80% o Memoria > 80%

---

## 🗄️ MANTENIMIENTO DE BASE DE DATOS

### Backups

**Railway PostgreSQL:**
- Railway hace backups automáticos (según plan)
- Verificar: Railway Dashboard → PostgreSQL → Backups

**Backup Manual:**
```bash
# Desde Railway terminal o local con DATABASE_PUBLIC_URL
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restauración

```bash
# Restaurar desde backup
psql $DATABASE_URL < backup_20250128_120000.sql
```

### Migraciones

**Automáticas:**
- El servidor ejecuta migraciones automáticamente al arrancar (`npm run start:with-migrations`)

**Manual:**
```bash
# Railway terminal
cd backend
npx prisma migrate deploy
```

### Limpieza

**Logs antiguos:**
```sql
-- Limpiar logs antiguos (ajustar fecha según necesidades)
DELETE FROM logs WHERE created_at < NOW() - INTERVAL '30 days';
```

**Jobs fallidos:**
```sql
-- Limpiar jobs fallidos antiguos
DELETE FROM job WHERE status = 'failed' AND updated_at < NOW() - INTERVAL '7 days';
```

---

## 📞 CONTACTOS Y RECURSOS

- **Railway Dashboard:** https://railway.app/dashboard
- **Railway Docs:** https://docs.railway.app
- **Health Check:** `https://tu-backend.up.railway.app/health`
- **Logs:** Railway Dashboard → Deployments → Logs

---

**Última actualización:** 2025-01-28

