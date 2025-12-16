# 🚀 RUNBOOK DE PRODUCCIÓN
## Ivan Reseller - Guía Operacional

**Versión:** 1.0.0  
**Última actualización:** 2025-12-15

---

## 📋 TABLA DE CONTENIDOS

1. [Configuración Inicial](#configuración-inicial)
2. [Variables de Entorno](#variables-de-entorno)
3. [Deployment](#deployment)
4. [Health Checks](#health-checks)
5. [Troubleshooting](#troubleshooting)
6. [Monitoreo](#monitoreo)
7. [Incident Response](#incident-response)

---

## ⚙️ CONFIGURACIÓN INICIAL

### Prerequisitos

#### Backend (Railway)
- Node.js 20+
- PostgreSQL 14+
- Redis 6+
- Railway CLI (opcional)

#### Frontend (Vercel)
- Node.js 20+
- Vercel CLI (opcional)

---

## 🔐 VARIABLES DE ENTORNO

### Backend - Variables Críticas (REQUERIDAS)

```bash
# Base de Datos
DATABASE_URL=postgresql://user:password@host:5432/database

# Redis
REDIS_URL=redis://user:password@host:6379

# Seguridad
JWT_SECRET=<min-32-characters-random-string>
ENCRYPTION_KEY=<min-32-characters-random-string>  # Puede ser igual a JWT_SECRET

# Servidor
NODE_ENV=production
PORT=3000
API_URL=https://your-backend.railway.app

# CORS
CORS_ORIGIN=https://your-frontend.vercel.app,https://your-domain.com
```

### Backend - Variables Opcionales (APIs Externas)

```bash
# eBay (Opcional - se configura desde UI)
EBAY_APP_ID=
EBAY_DEV_ID=
EBAY_CERT_ID=

# MercadoLibre (Opcional)
MERCADOLIBRE_CLIENT_ID=
MERCADOLIBRE_CLIENT_SECRET=

# PayPal (Opcional)
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENVIRONMENT=sandbox  # o 'production'

# GROQ AI (Opcional)
GROQ_API_KEY=

# ScraperAPI (Opcional)
SCRAPERAPI_KEY=
```

### Frontend - Variables

```bash
VITE_API_URL=https://your-backend.railway.app
```

### Generar Claves Seguras

```bash
# Generar JWT_SECRET / ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Debe generar una cadena de 64 caracteres hexadecimales
```

### Verificación de Variables

```bash
# En Railway, verificar que todas las variables estén configuradas
railway variables

# O desde el dashboard web
# Railway → tu-proyecto → Variables
```

---

## 🚀 DEPLOYMENT

### Backend (Railway)

#### Deployment Manual

1. **Push a GitHub:**
   ```bash
   git push origin main
   ```

2. **Railway detecta automáticamente el push y despliega**

3. **Verificar deployment:**
   ```bash
   railway logs
   ```

#### Deployment con Railway CLI

```bash
# Login
railway login

# Link proyecto
railway link

# Deploy
railway up

# Ver logs
railway logs --follow
```

#### Verificar Build

```bash
# Localmente antes de push
cd backend
npm run build

# Debe completar sin errores críticos
# Errores TypeScript menores son aceptables si el build completa
```

### Frontend (Vercel)

#### Deployment Manual

1. **Push a GitHub** (mismo repo)

2. **Vercel detecta automáticamente y despliega**

3. **Verificar en dashboard de Vercel**

#### Deployment con Vercel CLI

```bash
cd frontend
vercel --prod
```

---

## ✅ HEALTH CHECKS

### Endpoints Disponibles

#### Health Check Básico
```bash
GET /health

# Respuesta esperada:
{
  "status": "ok",
  "timestamp": "2025-12-15T10:00:00Z"
}
```

#### Ready Check
```bash
GET /ready

# Respuesta esperada:
{
  "ready": true,
  "database": "connected",
  "redis": "connected"  # si está configurado
}
```

#### Verificar desde CLI

```bash
# Health check
curl https://your-backend.railway.app/health

# Ready check
curl https://your-backend.railway.app/ready
```

### Monitoreo Externo

Configurar en servicio de monitoreo (UptimeRobot, Pingdom, etc.):
- **URL:** `https://your-backend.railway.app/health`
- **Intervalo:** 5 minutos
- **Timeout:** 10 segundos
- **Alerta si:** Status != 200 o respuesta != `{"status":"ok"}`

---

## 🔧 TROUBLESHOOTING

### Problema: Backend no inicia

#### Síntomas
- Railway muestra "Crashed"
- Logs muestran error de inicialización

#### Diagnóstico

1. **Verificar logs:**
   ```bash
   railway logs --tail 100
   ```

2. **Errores comunes:**

   **a) DATABASE_URL no configurada:**
   ```
   ❌ ERROR: DATABASE_URL no está configurada
   ```
   **Solución:**
   - Railway Dashboard → Variables → Agregar `DATABASE_URL`
   - Copiar valor de Postgres → Variables → `DATABASE_URL`

   **b) ENCRYPTION_KEY inválida:**
   ```
   ❌ ERROR CRÍTICO DE SEGURIDAD: ENCRYPTION_KEY no válida
   ```
   **Solución:**
   - Generar clave: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Agregar en Railway Variables como `ENCRYPTION_KEY`

   **c) Error de migraciones:**
   ```
   Error: Migration failed
   ```
   **Solución:**
   - Verificar conexión a DB
   - Ejecutar manualmente: `railway run npx prisma migrate deploy`

---

### Problema: APIs externas fallan

#### Síntomas
- Errores 500 en endpoints de marketplace
- Logs muestran "External API error"

#### Diagnóstico

1. **Verificar credenciales:**
   ```bash
   # Desde la UI: /settings/apis
   # Verificar que las APIs estén "Configurado y funcionando"
   ```

2. **Errores comunes:**

   **a) Rate Limit excedido:**
   ```
   API_RATE_LIMIT: Too many requests
   ```
   **Solución:**
   - Esperar cooldown period
   - Verificar límites del plan de la API
   - Implementar rate limiting (ver PRODUCTION_READINESS_REPORT.md)

   **b) Timeout:**
   ```
   API_TIMEOUT: Request timeout
   ```
   **Solución:**
   - Verificar conectividad
   - Revisar logs de la API externa
   - Verificar que la API esté online

   **c) Credenciales inválidas:**
   ```
   CREDENTIALS_ERROR: Invalid API key
   ```
   **Solución:**
   - Verificar credenciales en `/settings/apis`
   - Re-generar keys si es necesario
   - Verificar que las credenciales correspondan al ambiente (sandbox/production)

---

### Problema: Base de datos no conecta

#### Síntomas
- Errores de conexión en logs
- Health check falla

#### Diagnóstico

1. **Verificar DATABASE_URL:**
   ```bash
   # En Railway, verificar variable
   railway variables
   ```

2. **Verificar Postgres:**
   - Railway Dashboard → Postgres → Verificar que esté "Online"
   - Verificar que el plan tenga recursos disponibles

3. **Probar conexión:**
   ```bash
   # Desde Railway CLI
   railway connect postgres
   
   # O desde terminal local con DATABASE_URL
   psql $DATABASE_URL
   ```

---

### Problema: Redis no conecta

#### Síntomas
- Warnings en logs: "Redis not configured"
- Cache no funciona (pero sistema sigue funcionando)

#### Diagnóstico

1. **Redis es opcional** - El sistema funciona sin Redis pero con cache in-memory

2. **Si Redis está configurado pero falla:**
   - Verificar `REDIS_URL` en Railway Variables
   - Verificar que Redis service esté "Online"
   - Sistema debería degradar gracefully a cache in-memory

---

### Problema: Frontend no conecta al backend

#### Síntomas
- Errores CORS en consola del navegador
- Requests fallan con 401/403

#### Diagnóstico

1. **Verificar CORS_ORIGIN:**
   ```bash
   # Backend debe tener frontend URL en CORS_ORIGIN
   CORS_ORIGIN=https://your-frontend.vercel.app
   ```

2. **Verificar VITE_API_URL:**
   ```bash
   # Frontend debe apuntar al backend correcto
   VITE_API_URL=https://your-backend.railway.app
   ```

3. **Verificar HTTPS:**
   - Ambos deben usar HTTPS en producción
   - Verificar certificados SSL

---

## 📊 MONITOREO

### Métricas Clave

#### Backend
- **Uptime:** > 99.5%
- **Response Time:** < 500ms (p95)
- **Error Rate:** < 1%
- **API Success Rate:** > 95%

#### Base de Datos
- **Connection Pool:** < 80% utilizado
- **Query Time:** < 100ms (p95)
- **Replication Lag:** < 1s (si aplica)

#### APIs Externas
- **Success Rate:** > 90%
- **Rate Limit Usage:** < 80%
- **Timeout Rate:** < 5%

### Logs Importantes

#### Niveles de Log
- **ERROR:** Errores críticos que requieren atención inmediata
- **WARN:** Advertencias que pueden indicar problemas futuros
- **INFO:** Información operacional normal
- **DEBUG:** Detalles para debugging (solo en desarrollo)

#### Buscar en Logs

```bash
# Errores críticos
railway logs | grep ERROR

# Warnings de APIs
railway logs | grep "API.*WARN"

# Timeouts
railway logs | grep "timeout"

# Rate limits
railway logs | grep "rate.*limit"
```

---

## 🚨 INCIDENT RESPONSE

### Niveles de Severidad

| Severidad | Descripción | Response Time | Escalación |
|-----------|-------------|---------------|------------|
| **P0 - Crítico** | Sistema completamente caído | < 15 min | Inmediato |
| **P1 - Alto** | Funcionalidad crítica degradada | < 1 hora | 30 min |
| **P2 - Medio** | Funcionalidad no crítica afectada | < 4 horas | 2 horas |
| **P3 - Bajo** | Mejora menor o bug cosmético | < 24 horas | 8 horas |

### Procedimiento P0 - Sistema Caído

1. **Verificar estado:**
   ```bash
   curl https://your-backend.railway.app/health
   ```

2. **Revisar logs:**
   ```bash
   railway logs --tail 200
   ```

3. **Verificar servicios dependientes:**
   - Postgres: Railway Dashboard
   - Redis: Railway Dashboard
   - APIs externas: Status pages

4. **Acciones inmediatas:**
   - Si es DB: Verificar Postgres service
   - Si es código: Rollback a versión anterior
   - Si es infraestructura: Escalar en Railway dashboard

5. **Comunicación:**
   - Actualizar status page (si aplica)
   - Notificar a usuarios afectados

### Rollback

#### Railway
```bash
# Ver deployments
railway deployments

# Rollback a versión anterior
railway rollback <deployment-id>
```

#### Vercel
```bash
# Desde dashboard: Deployments → Previous → Promote to Production
# O CLI:
vercel rollback
```

---

## 📞 CONTACTOS Y RECURSOS

### Documentación
- **Este Runbook:** `RUNBOOK_PROD.md`
- **Reporte de Auditoría:** `PRODUCTION_READINESS_REPORT.md`
- **Matriz de Riesgos:** `RISK_MATRIX.md`

### Recursos Externos
- **Railway Dashboard:** https://railway.app
- **Vercel Dashboard:** https://vercel.com
- **Postgres Docs:** https://www.postgresql.org/docs/
- **Redis Docs:** https://redis.io/docs/

### Checklists

#### Pre-Deployment
- [ ] Variables de entorno configuradas
- [ ] Health checks pasando
- [ ] Tests ejecutados (si aplica)
- [ ] Logs revisados
- [ ] Backup de DB realizado (si cambios de schema)

#### Post-Deployment
- [ ] Health check pasando
- [ ] Logs sin errores críticos
- [ ] Funcionalidad crítica verificada
- [ ] Monitoreo activo

---

**Última actualización:** 2025-12-15  
**Mantenedor:** DevOps Team

