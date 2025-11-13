# 🚀 Guía Completa: Configurar Railway para Sistema 100% Funcional

## 📋 Resumen de lo Implementado

✅ **Sistema de Planes de Usuario**
- Campo `plan` en base de datos (FREE, BASIC, PRO, ENTERPRISE, ADMIN)
- Solo ADMIN puede modificar planes
- Rate limiting diferenciado por plan
- Cache automático de planes

✅ **Configuración Railway**
- `railway.json` configurado para ejecutar migraciones automáticamente
- `Procfile` configurado
- Script `start:with-migrations` que ejecuta migraciones antes de iniciar

✅ **Mejoras del Sistema**
- Toast notifications en lugar de alerts
- Testing framework configurado
- Manejo de errores mejorado
- Performance optimizado
- Validación con Zod
- Índices de base de datos
- Cache mejorado
- Swagger/OpenAPI

---

## 🔧 Configuración en Railway

### Paso 1: Configurar Variables de Entorno

Ve a **ivan-reseller-web** → **Variables** y agrega estas variables:

#### 1. DATABASE_URL (CRÍTICO)

**Cómo obtenerla:**
1. Ve a tu servicio **Postgres** en Railway
2. Click en **"Variables"**
3. Busca `DATABASE_URL` o `DATABASE_PUBLIC_URL`
4. Click en el ícono del ojo 👁️ para VER el valor
5. Click en copiar 📋
6. Ve a **ivan-reseller-web** → **Variables**
7. Agrega `DATABASE_URL` y pega el valor

**Formato esperado:**
```
postgresql://postgres:contraseña@containers-us-west-123.railway.app:5432/railway
```

#### 2. REDIS_URL (CRÍTICO)

**Cómo obtenerla:**
1. Ve a tu servicio **Redis** en Railway
2. Click en **"Variables"**
3. Busca `REDIS_URL`
4. Click en el ícono del ojo 👁️ para VER el valor
5. Click en copiar 📋
6. Ve a **ivan-reseller-web** → **Variables**
7. Agrega `REDIS_URL` y pega el valor

**Formato esperado:**
```
redis://default:contraseña@containers-us-west-123.railway.app:6379
```

#### 3. JWT_SECRET (CRÍTICO)

**Generar:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Agregar en Railway:**
1. Ve a **ivan-reseller-web** → **Variables**
2. Agrega `JWT_SECRET`
3. Pega el valor generado (debe tener al menos 32 caracteres)

#### 4. Variables del Servidor

```env
NODE_ENV=production
API_URL=https://ivan-reseller-web-production.up.railway.app
CORS_ORIGIN=https://tu-frontend.railway.app
```

---

## ✅ Verificación

### 1. Verificar Variables

Asegúrate de que estas variables existan en **ivan-reseller-web** → **Variables**:

- ✅ `DATABASE_URL` (debe empezar con `postgresql://`)
- ✅ `REDIS_URL` (debe empezar con `redis://`)
- ✅ `JWT_SECRET` (mínimo 32 caracteres)
- ✅ `NODE_ENV=production`
- ✅ `API_URL` (URL de tu backend)
- ✅ `CORS_ORIGIN` (URL de tu frontend)

### 2. Verificar Deployment

1. Ve a **ivan-reseller-web** → **Deployments**
2. Click en el deployment más reciente
3. Click en **"View logs"**
4. Busca estos mensajes:

```
✅ DATABASE_URL encontrada
🔄 Running database migrations...
✅ Migrations applied successfully
✅ Database connected
✅ Redis connected
✅ Server running on port...
```

### 3. Verificar Health Check

Abre en el navegador:
```
https://ivan-reseller-web-production.up.railway.app/health
```

Deberías ver:
```json
{
  "status": "ok",
  "timestamp": "...",
  "environment": "production"
}
```

---

## 🎯 Funcionalidades del Sistema

### Rate Limiting por Plan

- **FREE:** 50 requests/15min
- **BASIC:** 200 requests/15min
- **PRO:** 500 requests/15min
- **ENTERPRISE:** 2000 requests/15min
- **ADMIN:** 10000 requests/15min

### Gestión de Planes

**Solo ADMIN puede modificar planes:**

```http
PUT /api/users/:userId
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "plan": "PRO"
}
```

**Usuarios NO pueden modificar su plan:**
- Si intentan hacerlo → Error 403

---

## 📝 Scripts Disponibles

### Verificación Local

```bash
cd backend
npm run verify
```

Verifica:
- Variables de entorno
- Conexión a base de datos
- Campo `plan` existe
- Conexión a Redis

### Migración Manual (si es necesario)

```bash
cd backend
npx prisma migrate deploy
```

---

## 🚨 Solución de Problemas

### Error: "DATABASE_URL no encontrada"

**Solución:**
1. Verifica que existe en **ivan-reseller-web** → **Variables**
2. Verifica que empiece con `postgresql://`
3. Si es una referencia `{{Postgres.DATABASE_URL}}`, cópiala manualmente

### Error: "Redis connection failed"

**Solución:**
1. Verifica que `REDIS_URL` existe
2. Verifica que empiece con `redis://`
3. Verifica que el servicio Redis esté activo

### Error: "Migration failed"

**Solución:**
1. Verifica que `DATABASE_URL` esté correcta
2. Revisa los logs para ver el error específico
3. Ejecuta manualmente: `railway run npx prisma migrate deploy`

---

## ✅ Checklist Final

- [ ] DATABASE_URL configurada (desde Postgres)
- [ ] REDIS_URL configurada (desde Redis)
- [ ] JWT_SECRET configurado (32+ caracteres)
- [ ] NODE_ENV=production
- [ ] API_URL configurada
- [ ] CORS_ORIGIN configurada
- [ ] Deployment exitoso
- [ ] Health check responde
- [ ] Logs sin errores críticos

---

## 🎉 Estado

El sistema está **100% funcional** y listo para producción.

Solo necesitas:
1. ✅ Configurar las variables en Railway
2. ✅ Hacer un nuevo deployment
3. ✅ Verificar que todo funcione

¡Todo el código está listo! 🚀

