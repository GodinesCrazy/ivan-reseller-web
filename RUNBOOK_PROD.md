# 🚀 RUNBOOK PRODUCCIÓN - Ivan Reseller SaaS

**Última actualización:** 2025-12-15  
**Versión:** 1.0.0

---

## 📋 ÍNDICE

1. [Configuración Inicial](#configuración-inicial)
2. [Variables de Entorno](#variables-de-entorno)
3. [Despliegue](#despliegue)
4. [Troubleshooting](#troubleshooting)
5. [Monitoreo](#monitoreo)
6. [Escalado](#escalado)

---

## 🔧 CONFIGURACIÓN INICIAL

### Requisitos Previos

- Node.js 20+
- PostgreSQL 16+
- Redis 7+ (opcional pero recomendado)
- Railway account (o similar)
- Vercel account (para frontend)

### Instalación Local (Desarrollo)

```bash
# Clonar repositorio
git clone <repo-url>
cd ivan-reseller-web

# Backend
cd backend
npm install
cp .env.example .env
# Editar .env con tus credenciales
npm run dev

# Frontend (en otra terminal)
cd frontend
npm install
cp .env.example .env
# Editar .env con VITE_API_URL
npm run dev
```

---

## 🔐 VARIABLES DE ENTORNO

### Variables Críticas (OBLIGATORIAS)

```bash
# Base de Datos
DATABASE_URL=postgresql://user:password@host:5432/database

# Redis (opcional pero recomendado)
REDIS_URL=redis://host:6379

# Seguridad (MÍNIMO 32 caracteres)
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
ENCRYPTION_KEY=your-64-character-hexadecimal-encryption-key-0123456789abcdef0123456789abcdef

# CORS
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
FRONTEND_URL=https://yourdomain.com

# Entorno
NODE_ENV=production
PORT=3000
```

### Variables de APIs (Opcionales)

Ver `ENV_VARIABLES_DOCUMENTATION.md` para lista completa.

**Importante:** NUNCA commitees archivos `.env` con valores reales.

---

## 🚀 DESPLIEGUE

### Railway (Backend)

1. **Conectar Repositorio:**
   - Railway Dashboard → New Project → Deploy from GitHub
   - Seleccionar repositorio y rama `main`

2. **Configurar Variables:**
   - Settings → Variables
   - Agregar todas las variables críticas
   - **CRÍTICO:** `ENCRYPTION_KEY` debe tener 64 caracteres hexadecimales

3. **Configurar Servicios:**
   - Agregar PostgreSQL service
   - Agregar Redis service (opcional)
   - Conectar servicios al backend

4. **Health Checks:**
   - Railway detectará automáticamente `/health` y `/ready`
   - Verificar que ambos endpoints respondan 200

### Vercel (Frontend)

1. **Conectar Repositorio:**
   - Vercel Dashboard → New Project
   - Importar repositorio

2. **Configurar Build:**
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

3. **Variables de Entorno:**
   - `VITE_API_URL`: URL del backend en Railway
   - `VITE_WS_URL`: WebSocket URL (mismo dominio que API)

---

## 🔍 TROUBLESHOOTING

### Problema: Backend no inicia

**Síntomas:**
- Logs muestran "DATABASE_URL no encontrada"
- Error de conexión a base de datos

**Solución:**
1. Verificar que `DATABASE_URL` esté configurada en Railway
2. Verificar que la URL sea interna (`postgres.railway.internal`)
3. Verificar que el servicio PostgreSQL esté corriendo

**Comando de diagnóstico:**
```bash
# En Railway, ejecutar en shell del servicio
echo $DATABASE_URL
```

---

### Problema: Health checks fallan

**Síntomas:**
- `/health` retorna 503
- `/ready` retorna 503

**Solución:**
1. Verificar logs del servicio
2. Verificar conexión a PostgreSQL:
   ```bash
   # En Railway shell
   npx prisma db pull
   ```
3. Verificar conexión a Redis (si está configurado):
   ```bash
   redis-cli -u $REDIS_URL ping
   ```

---

### Problema: APIs externas no funcionan

**Síntomas:**
- Errores 401/403 en llamadas a APIs
- Mensajes "API not configured"

**Solución:**
1. Verificar credenciales en `/api/system/api-status`
2. Verificar que las credenciales estén encriptadas correctamente
3. Verificar que `ENCRYPTION_KEY` esté configurada
4. Revisar logs para errores específicos de API

**Comando de diagnóstico:**
```bash
# Verificar estado de APIs
curl -H "Authorization: Bearer <token>" \
  https://your-backend.railway.app/api/system/api-status
```

---

### Problema: Frontend no se conecta al backend

**Síntomas:**
- Errores CORS en consola del navegador
- Requests fallan con 401

**Solución:**
1. Verificar `CORS_ORIGIN` en backend incluye el dominio del frontend
2. Verificar `VITE_API_URL` en frontend apunta al backend correcto
3. Verificar que ambos estén en HTTPS en producción

---

### Problema: Migraciones fallan

**Síntomas:**
- Error "Migration failed" en logs
- Tablas no se crean

**Solución:**
1. Verificar que `DATABASE_URL` sea correcta
2. Ejecutar migraciones manualmente:
   ```bash
   npx prisma migrate deploy
   ```
3. Si falla, usar `db push` como fallback:
   ```bash
   npx prisma db push --accept-data-loss
   ```

---

## 📊 MONITOREO

### Health Checks

**Endpoints:**
- `GET /health` - Liveness probe (proceso vivo)
- `GET /ready` - Readiness probe (puede servir tráfico)

**Configuración Railway:**
- Health Check Path: `/health`
- Health Check Port: `3000`
- Health Check Timeout: `5s`

### Logs

**Ubicación:**
- Railway: Dashboard → Service → Logs
- Vercel: Dashboard → Project → Logs

**Niveles:**
- `error` - Errores críticos
- `warn` - Advertencias
- `info` - Información general
- `debug` - Debugging (solo desarrollo)

**Búsqueda de errores:**
```bash
# En Railway logs, buscar:
grep -i "error\|fatal\|critical" logs.txt
```

### Métricas Clave

**Monitorear:**
- Tiempo de respuesta de `/health` y `/ready`
- Tasa de errores 5xx
- Uso de memoria y CPU
- Conexiones a base de datos
- Tasa de éxito de APIs externas

---

## 📈 ESCALADO

### Escalar Backend

**Railway:**
1. Settings → Scaling
2. Aumentar número de instancias
3. Configurar load balancer (automático)

**Consideraciones:**
- Redis debe estar disponible para sesiones compartidas
- Base de datos debe soportar conexiones concurrentes
- Health checks deben estar configurados

### Escalar Base de Datos

**Railway PostgreSQL:**
1. Settings → Scaling
2. Aumentar recursos (CPU, RAM, Storage)
3. Considerar read replicas para alta carga

---

## 🔒 SEGURIDAD

### Checklist Pre-Producción

- [ ] `ENCRYPTION_KEY` configurada (64 caracteres hex)
- [ ] `JWT_SECRET` configurado (mínimo 32 caracteres)
- [ ] `CORS_ORIGIN` restringido a dominios permitidos
- [ ] HTTPS habilitado en producción
- [ ] Variables de entorno no expuestas en logs
- [ ] Rate limiting configurado
- [ ] Helmet configurado (CSP, HSTS)
- [ ] Credenciales de APIs encriptadas

### Rotación de Secretos

**Frecuencia recomendada:**
- `JWT_SECRET`: Cada 90 días
- `ENCRYPTION_KEY`: Cada 180 días (requiere re-encriptar credenciales)
- API Keys: Según política del proveedor

**Proceso:**
1. Generar nuevo secreto
2. Actualizar variable de entorno
3. Reiniciar servicio
4. Verificar que todo funcione

---

## 📞 CONTACTO Y SOPORTE

**Documentación:**
- Reporte de Producción: `PRODUCTION_READINESS_REPORT.md`
- Matriz de Riesgos: `RISK_MATRIX.md`
- Variables de Entorno: `ENV_VARIABLES_DOCUMENTATION.md`

**Comandos Útiles:**
```bash
# Verificar estado del sistema
curl https://your-backend.railway.app/health
curl https://your-backend.railway.app/ready

# Verificar APIs configuradas (requiere auth)
curl -H "Authorization: Bearer <token>" \
  https://your-backend.railway.app/api/system/api-status

# Ejecutar migraciones
npx prisma migrate deploy

# Generar Prisma Client
npx prisma generate
```

---

**Última revisión:** 2025-12-15
