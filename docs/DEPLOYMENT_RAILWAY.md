# 🚀 Deployment en Railway - Ivan Reseller

**Guía completa para desplegar Ivan Reseller en Railway**

**Última actualización:** 2025-01-27  
**Versión:** 1.0

---

## 📋 Prerrequisitos

- Cuenta en [Railway](https://railway.app)
- Repositorio Git conectado a Railway (GitHub, GitLab, etc.)
- Dominio personalizado (opcional, recomendado para producción)

---

## 🏗️ Arquitectura en Railway

### Servicios Necesarios

1. **Backend Service** (Node.js)
   - Puerto: Railway lo asigna automáticamente (variable `PORT`)
   - Base de código: `backend/`

2. **Frontend Service** (React/Vite) - Opcional en Railway
   - Recomendado: Desplegar en Vercel o Netlify
   - Si usas Railway: Base de código: `frontend/`

3. **PostgreSQL Database** (Railway Plugin)
   - Se crea automáticamente como servicio separado
   - Variable `DATABASE_URL` se inyecta automáticamente

4. **Redis** (Railway Plugin)
   - Se crea automáticamente como servicio separado
   - Variable `REDIS_URL` se inyecta automáticamente

---

## 📦 Paso 1: Crear Proyecto en Railway

1. Ve a [Railway Dashboard](https://railway.app/dashboard)
2. Haz clic en "New Project"
3. Selecciona "Deploy from GitHub repo" (o tu proveedor Git)
4. Conecta tu repositorio `Ivan_Reseller_Web`

---

## 🔧 Paso 2: Configurar Backend Service

### 2.1 Crear Backend Service

1. En el proyecto Railway, haz clic en "New Service"
2. Selecciona "GitHub Repo" y elige tu repositorio
3. Railway detectará automáticamente el servicio

### 2.2 Configurar Root Directory

1. Ve a "Settings" del servicio backend
2. En "Root Directory", establece: `backend`
3. Guarda los cambios

### 2.3 Configurar Build Command

1. En "Settings" → "Build Command", establece:
   ```bash
   npm ci && npm run build
   ```

### 2.4 Configurar Start Command

1. En "Settings" → "Start Command", establece:
   ```bash
   npm start
   ```

### 2.5 Configurar Variables de Entorno

Ve a "Variables" y agrega las siguientes variables:

#### Variables Críticas (Obligatorias)

```env
# JWT Secret (generar con: openssl rand -base64 64)
JWT_SECRET=<tu-secret-jwt-aqui>

# Encryption Key (generar con: openssl rand -base64 32)
ENCRYPTION_KEY=<tu-encryption-key-aqui>

# CORS Origins (separados por comas, SIN espacios después de las comas)
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com

# API URL (URL pública del backend en Railway)
API_URL=https://tu-backend.up.railway.app

# Frontend URL
FRONTEND_URL=https://www.ivanreseller.com

# Ambiente
NODE_ENV=production

# Feature Flags
ALLOW_BROWSER_AUTOMATION=true
SCRAPER_BRIDGE_ENABLED=true
ALIEXPRESS_DATA_SOURCE=api
ALIEXPRESS_AUTH_MONITOR_ENABLED=true
```

#### Variables de Base de Datos y Redis

**⚠️ IMPORTANTE:** Estas se inyectan automáticamente cuando agregas los plugins. NO las definas manualmente.

- `DATABASE_URL` - Se inyecta automáticamente desde PostgreSQL plugin
- `REDIS_URL` - Se inyecta automáticamente desde Redis plugin

#### Variables Opcionales

```env
# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_DEFAULT=200
RATE_LIMIT_ADMIN=1000
RATE_LIMIT_LOGIN=5

# Logging
LOG_LEVEL=info
```

### 2.6 Agregar PostgreSQL Database

1. En el proyecto Railway, haz clic en "New Service"
2. Selecciona "Database" → "Add PostgreSQL"
3. Railway creará automáticamente la base de datos
4. La variable `DATABASE_URL` se inyectará automáticamente en el backend

### 2.7 Agregar Redis

1. En el proyecto Railway, haz clic en "New Service"
2. Selecciona "Database" → "Add Redis"
3. Railway creará automáticamente Redis
4. La variable `REDIS_URL` se inyectará automáticamente en el backend

### 2.8 Ejecutar Migraciones

Después del primer deploy, ejecuta las migraciones:

1. Ve a "Deployments" del backend service
2. Haz clic en el deployment más reciente
3. Abre la terminal
4. Ejecuta:
   ```bash
   npx prisma migrate deploy
   ```

**Alternativa:** Configura un script de post-deploy en Railway:

1. En "Settings" → "Deploy", agrega un "Post Deploy Command":
   ```bash
   npx prisma migrate deploy
   ```

---

## 🌐 Paso 3: Configurar Dominio Personalizado

### 3.1 En Railway

1. Ve a "Settings" del backend service
2. En "Domains", haz clic en "Generate Domain"
3. Railway generará un dominio como: `tu-backend.up.railway.app`
4. (Opcional) Agrega un dominio personalizado:
   - Haz clic en "Custom Domain"
   - Ingresa tu dominio (ej: `api.ivanreseller.com`)
   - Sigue las instrucciones para configurar DNS

### 3.2 Configurar DNS

Si usas un dominio personalizado:

1. Agrega un registro CNAME en tu proveedor DNS:
   ```
   api.ivanreseller.com → tu-backend.up.railway.app
   ```

2. Espera a que Railway verifique el dominio (puede tardar unos minutos)

---

## ✅ Paso 4: Verificación Post-Deploy

### 4.1 Health Checks

```bash
# Health check básico
curl https://tu-backend.up.railway.app/health

# Debe responder: {"status":"ok","timestamp":"..."}

# Health check detallado
curl https://tu-backend.up.railway.app/api/system/health/detailed

# CORS debug
curl -H "Origin: https://www.ivanreseller.com" \
     https://tu-backend.up.railway.app/api/cors-debug
```

### 4.2 Verificar Logs

1. Ve a "Deployments" del backend service
2. Haz clic en el deployment más reciente
3. Revisa los logs para verificar que:
   - La base de datos se conectó correctamente
   - Redis se conectó correctamente
   - El servidor inició en el puerto correcto
   - No hay errores de CORS

### 4.3 Verificar Variables de Entorno

En los logs del backend, deberías ver algo como:

```
✅ Environment: production, Port: <puerto-asignado>
✅ Database connected
✅ Redis connected
✅ CORS origins configured: https://www.ivanreseller.com, https://ivanreseller.com
```

---

## 🔄 Paso 5: Configurar Frontend (Vercel/Netlify)

**Recomendación:** Desplegar el frontend en Vercel o Netlify para mejor rendimiento.

### 5.1 Variables de Entorno en Vercel

1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agrega:
   ```env
   VITE_API_URL=https://tu-backend.up.railway.app
   VITE_LOG_LEVEL=warn
   ```

### 5.2 Build Settings en Vercel

1. Root Directory: `frontend`
2. Build Command: `npm ci && npm run build`
3. Output Directory: `dist`

---

## 🐛 Troubleshooting

### Error: "Cannot connect to database"

**Solución:**
1. Verifica que el plugin PostgreSQL esté agregado
2. Verifica que `DATABASE_URL` esté presente en las variables (se inyecta automáticamente)
3. Revisa los logs del backend para ver el error específico

### Error: "CORS blocked"

**Solución:**
1. Verifica que `CORS_ORIGIN` incluya el dominio exacto del frontend
2. **IMPORTANTE:** El valor NO debe incluir el prefijo "CORS_ORIGIN="
   - ✅ Correcto: `https://www.ivanreseller.com,https://ivanreseller.com`
   - ❌ Incorrecto: `CORS_ORIGIN=https://www.ivanreseller.com`
3. Verifica que no haya espacios después de las comas
4. Usa el endpoint `/api/cors-debug` para diagnosticar

### Error: "ENCRYPTION_KEY is not set"

**Solución:**
1. Genera una ENCRYPTION_KEY de 32 bytes
2. Agrega la variable en Railway
3. Redeploy el servicio

### Error: "JWT_SECRET is not set"

**Solución:**
1. Genera un JWT_SECRET de al menos 32 caracteres
2. Agrega la variable en Railway
3. Redeploy el servicio

### Error: Migraciones fallan

**Solución:**
1. Verifica que `DATABASE_URL` esté correcta
2. Ejecuta manualmente: `npx prisma migrate deploy`
3. Revisa los logs para ver el error específico

### Error: Puerto no disponible

**Solución:**
- Railway asigna el puerto automáticamente
- NO definas `PORT` manualmente
- El backend debe leer `process.env.PORT` (ya está configurado)

---

## 📊 Monitoreo y Logs

### Ver Logs en Tiempo Real

1. Ve a "Deployments" del backend service
2. Haz clic en el deployment activo
3. Revisa la pestaña "Logs"

### Métricas

Railway proporciona métricas básicas:
- CPU usage
- Memory usage
- Network traffic
- Request count

---

## 🔐 Seguridad

### Variables Sensibles

- **NUNCA** commitees variables de entorno con valores reales
- Usa Railway's Variables para secretos
- Rotar `JWT_SECRET` y `ENCRYPTION_KEY` periódicamente

### HTTPS

Railway proporciona HTTPS automáticamente para dominios `.up.railway.app`
Para dominios personalizados, configura SSL en Railway (automático con Let's Encrypt)

---

## 📚 Recursos Adicionales

- **Documentación de Railway:** https://docs.railway.app
- **Guía de Troubleshooting:** [docs/TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **Guía de CORS:** [docs/CORS_TROUBLESHOOTING.md](./CORS_TROUBLESHOOTING.md)

---

**Última actualización:** 2025-01-27

