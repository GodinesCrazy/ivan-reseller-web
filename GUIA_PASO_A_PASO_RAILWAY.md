# 🚀 Guía Paso a Paso: Configurar Railway y Deployment

## 📋 Índice

1. [Obtener DATABASE_URL desde Postgres](#1-obtener-database_url-desde-postgres)
2. [Obtener REDIS_URL desde Redis](#2-obtener-redis_url-desde-redis)
3. [Generar JWT_SECRET](#3-generar-jwt_secret)
4. [Configurar Variables en ivan-reseller-web](#4-configurar-variables-en-ivan-reseller-web)
5. [Hacer Deployment](#5-hacer-deployment)
6. [Verificar que Funciona](#6-verificar-que-funciona)

---

## 1. Obtener DATABASE_URL desde Postgres

### Paso 1.1: Ir al Servicio Postgres
1. Abre Railway Dashboard: https://railway.app
2. Click en tu proyecto **"ivan-reseller"**
3. En la vista **"Architecture"**, busca el servicio **"Postgres"** (ícono de elefante 🐘)
4. **Click en el servicio Postgres**

### Paso 1.2: Abrir Variables
1. En la parte superior, verás pestañas: **"Deployments"**, **"Variables"**, **"Metrics"**, **"Settings"**
2. **Click en la pestaña "Variables"**

### Paso 1.3: Encontrar DATABASE_URL
1. Busca en la lista una de estas variables:
   - `DATABASE_URL`
   - `DATABASE_PUBLIC_URL`
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`

2. Si encuentras una, verás:
   - Nombre de la variable (ej: `DATABASE_URL`)
   - Un ícono de ojo 👁️ (para ver el valor)
   - Un ícono de copiar 📋

### Paso 1.4: Copiar el Valor
1. **Click en el ícono del ojo 👁️** para VER el valor completo
2. Se mostrará el valor (ej: `postgresql://postgres:xxxxx@containers-us-west-123.railway.app:5432/railway`)
3. **Click en el ícono de copiar 📋** para copiar TODO el valor
4. **Guarda este valor** (lo necesitarás en el paso 4)

**⚠️ IMPORTANTE:**
- El valor debe empezar con `postgresql://` o `postgres://`
- Debe incluir usuario, contraseña, host, puerto y base de datos
- NO debe ser una referencia como `{{Postgres.DATABASE_URL}}`

---

## 2. Obtener REDIS_URL desde Redis

### Paso 2.1: Ir al Servicio Redis
1. En la vista **"Architecture"**, busca el servicio **"Redis"** (ícono de Redis)
2. **Click en el servicio Redis**

### Paso 2.2: Abrir Variables
1. Click en la pestaña **"Variables"**

### Paso 2.3: Encontrar REDIS_URL
1. Busca la variable `REDIS_URL` en la lista
2. Verás el ícono del ojo 👁️ y el ícono de copiar 📋

### Paso 2.4: Copiar el Valor
1. **Click en el ícono del ojo 👁️** para VER el valor
2. Se mostrará algo como: `redis://default:xxxxx@containers-us-west-123.railway.app:6379`
3. **Click en el ícono de copiar 📋** para copiar TODO el valor
4. **Guarda este valor** (lo necesitarás en el paso 4)

**⚠️ IMPORTANTE:**
- El valor debe empezar con `redis://`
- Debe incluir usuario, contraseña, host y puerto

---

## 3. Generar JWT_SECRET

### Paso 3.1: Abrir Terminal
1. Abre PowerShell o Terminal
2. Navega a tu proyecto (opcional, no es necesario)

### Paso 3.2: Generar JWT_SECRET
Ejecuta este comando:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Paso 3.3: Copiar el Resultado
1. Verás una cadena larga de caracteres (64 caracteres hexadecimales)
2. **Copia TODO el resultado**
3. **Guarda este valor** (lo necesitarás en el paso 4)

**Ejemplo de resultado:**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

---

## 4. Configurar Variables en ivan-reseller-web

### Paso 4.1: Ir al Servicio Backend
1. En Railway Dashboard, en la vista **"Architecture"**
2. Busca el servicio **"ivan-reseller-web"** (ícono de GitHub 🐙)
3. **Click en el servicio ivan-reseller-web**

### Paso 4.2: Abrir Variables
1. Click en la pestaña **"Variables"** (parte superior)

### Paso 4.3: Agregar DATABASE_URL

1. Click en el botón **"+ New Variable"** (esquina superior derecha)
2. En el campo **"Name"**, escribe: `DATABASE_URL`
3. En el campo **"Value"**, pega el valor que copiaste del Postgres (Paso 1.4)
4. Click en **"Add"**

**Verifica que:**
- El nombre sea exactamente `DATABASE_URL` (case-sensitive)
- El valor empiece con `postgresql://` o `postgres://`
- No haya espacios extra antes o después

### Paso 4.4: Agregar REDIS_URL

1. Click en **"+ New Variable"** nuevamente
2. **Name:** `REDIS_URL`
3. **Value:** Pega el valor que copiaste del Redis (Paso 2.4)
4. Click en **"Add"**

**Verifica que:**
- El valor empiece con `redis://`

### Paso 4.5: Agregar JWT_SECRET

1. Click en **"+ New Variable"** nuevamente
2. **Name:** `JWT_SECRET`
3. **Value:** Pega el valor que generaste (Paso 3.3)
4. Click en **"Add"**

**Verifica que:**
- El valor tenga al menos 32 caracteres (idealmente 64)

### Paso 4.6: Agregar Variables del Servidor

Agrega estas variables una por una:

#### NODE_ENV
1. Click en **"+ New Variable"**
2. **Name:** `NODE_ENV`
3. **Value:** `production`
4. Click en **"Add"**

#### API_URL
1. Click en **"+ New Variable"**
2. **Name:** `API_URL`
3. **Value:** `https://ivan-reseller-web-production.up.railway.app`
   - ⚠️ **Nota:** Reemplaza con la URL real de tu servicio si es diferente
   - Puedes encontrarla en **Settings** → **"Public Domain"**
4. Click en **"Add"**

#### CORS_ORIGIN
1. Click en **"+ New Variable"**
2. **Name:** `CORS_ORIGIN`
3. **Value:** `https://tu-frontend.railway.app`
   - ⚠️ **Nota:** Reemplaza con la URL real de tu frontend
4. Click en **"Add"**

### Paso 4.7: Verificar Todas las Variables

Tu lista de variables debería incluir:

- ✅ `DATABASE_URL` (debe empezar con `postgresql://`)
- ✅ `REDIS_URL` (debe empezar con `redis://`)
- ✅ `JWT_SECRET` (64 caracteres hexadecimales)
- ✅ `NODE_ENV` = `production`
- ✅ `API_URL` = URL de tu backend
- ✅ `CORS_ORIGIN` = URL de tu frontend

**Opcional (si las tienes):**
- `EBAY_APP_ID`
- `EBAY_DEV_ID`
- `EBAY_CERT_ID`
- `MERCADOLIBRE_CLIENT_ID`
- `MERCADOLIBRE_CLIENT_SECRET`
- `GROQ_API_KEY`
- `SCRAPERAPI_KEY`
- etc.

---

## 5. Hacer Deployment

### Opción A: Deployment Automático (Recomendado)

Si tienes GitHub conectado, Railway hará deployment automáticamente cuando hagas push:

1. **Commit y push tus cambios:**
   ```bash
   git add .
   git commit -m "feat: Sistema de planes de usuario y mejoras completas"
   git push origin main
   ```

2. **Railway detectará el push automáticamente**
3. **Ve a Railway Dashboard** → **ivan-reseller-web** → **Deployments**
4. Verás un nuevo deployment iniciándose

### Opción B: Deployment Manual

1. En Railway Dashboard, ve a **ivan-reseller-web**
2. Click en la pestaña **"Deployments"**
3. Click en el botón **"Redeploy"** (si existe)
   - O espera a que Railway detecte cambios automáticamente

### Paso 5.1: Monitorear el Deployment

1. Click en el deployment más reciente
2. Click en **"View logs"** o simplemente observa los logs en tiempo real

**Lo que deberías ver:**

```
🔍 DATABASE_URL encontrada:
   Variable: DATABASE_URL
   postgresql://postgres:***@xxxxx.railway.app:5432/railway
   Host: xxxxx.railway.app
   Port: 5432
   Database: railway
   User: postgres

🔄 Running database migrations... (attempt 1/3)
✅ Migrations applied successfully
✅ Database connected

🔌 Conectando a Redis...
✅ Redis connected

🚀 Ivan Reseller API Server
================================
Environment: production
Server: http://localhost:3001
Health: http://localhost:3001/health
================================

✅ Scheduled tasks initialized
```

**Si ves errores:**
- Revisa la sección "Solución de Problemas" más abajo

---

## 6. Verificar que Funciona

### Paso 6.1: Health Check

1. Ve a **ivan-reseller-web** → **Settings**
2. Busca **"Public Domain"** o la URL pública
3. Abre en el navegador: `https://tu-url.railway.app/health`

**Deberías ver:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-13T00:39:00.000Z",
  "environment": "production"
}
```

### Paso 6.2: Verificar Swagger (Opcional)

Si quieres ver la documentación de la API:
1. Abre: `https://tu-url.railway.app/api-docs`
2. Deberías ver la interfaz de Swagger con toda la documentación

### Paso 6.3: Verificar Logs

1. Ve a **ivan-reseller-web** → **Deployments**
2. Click en el deployment activo
3. Click en **"View logs"**
4. Busca estos mensajes de éxito:

```
✅ DATABASE_URL encontrada
✅ Migrations applied successfully
✅ Database connected
✅ Redis connected
✅ Server running on port...
```

### Paso 6.4: Verificar Campo `plan` en Base de Datos

**Opción 1: Desde Prisma Studio (Local)**
```bash
cd backend
npx prisma studio
```
Esto abrirá Prisma Studio en el navegador. Verifica que la tabla `users` tenga el campo `plan`.

**Opción 2: Desde los Logs**
Si la migración fue exitosa, verás en los logs:
```
✅ Migrations applied successfully
```

---

## 🚨 Solución de Problemas

### Error: "DATABASE_URL no encontrada"

**Síntomas en logs:**
```
❌ ERROR: DATABASE_URL no está configurada
```

**Solución:**
1. Ve a **ivan-reseller-web** → **Variables**
2. Verifica que `DATABASE_URL` existe
3. Verifica que el nombre sea exactamente `DATABASE_URL` (sin espacios)
4. Verifica que el valor empiece con `postgresql://`
5. Si es una referencia `{{Postgres.DATABASE_URL}}`, cópiala manualmente desde Postgres

### Error: "Redis connection failed"

**Síntomas en logs:**
```
❌ Redis connection failed
⚠️ Redis no configurado, continuando sin Redis
```

**Solución:**
1. Ve a **ivan-reseller-web** → **Variables**
2. Verifica que `REDIS_URL` existe
3. Verifica que empiece con `redis://`
4. Verifica que el servicio Redis esté activo

**Nota:** El sistema funcionará sin Redis, pero sin cache distribuido.

### Error: "JWT_SECRET must be at least 32 characters"

**Síntomas en logs:**
```
❌ ERROR DE VALIDACIÓN DE VARIABLES DE ENTORNO:
   - JWT_SECRET: String must contain at least 32 character(s)
```

**Solución:**
1. Genera un nuevo JWT_SECRET (Paso 3)
2. Ve a **ivan-reseller-web** → **Variables**
3. Edita `JWT_SECRET`
4. Pega el nuevo valor (debe tener 64 caracteres)
5. Guarda y reinicia el servicio

### Error: "Migration failed"

**Síntomas en logs:**
```
❌ Migration failed
⚠️ db push también falló
```

**Solución:**
1. Verifica que `DATABASE_URL` esté correcta
2. Verifica que la base de datos esté accesible
3. Revisa los logs para ver el error específico
4. Si es necesario, ejecuta manualmente desde Railway CLI:
   ```bash
   railway run npx prisma migrate deploy
   ```

### Error: "Port already in use"

**Síntomas:**
```
Error: listen EADDRINUSE: address already in use :::3001
```

**Solución:**
- Railway asigna el puerto automáticamente
- Verifica que estés usando `process.env.PORT` en el código
- El código ya está configurado para usar `env.PORT`

---

## ✅ Checklist Final

Antes de considerar el sistema 100% funcional:

- [ ] `DATABASE_URL` configurada y verificada
- [ ] `REDIS_URL` configurada y verificada
- [ ] `JWT_SECRET` configurado (64 caracteres)
- [ ] `NODE_ENV=production`
- [ ] `API_URL` configurada
- [ ] `CORS_ORIGIN` configurada
- [ ] Deployment completado exitosamente
- [ ] Health check responde correctamente
- [ ] Logs muestran "✅ Database connected"
- [ ] Logs muestran "✅ Redis connected"
- [ ] Logs muestran "✅ Server running"
- [ ] Migración del campo `plan` aplicada

---

## 📞 ¿Necesitas Ayuda?

Si encuentras algún problema:

1. **Revisa los logs** en Railway → Deployments → View logs
2. **Verifica las variables** en Railway → Variables
3. **Ejecuta verificación local:**
   ```bash
   cd backend
   npm run verify
   ```

---

## 🎉 ¡Listo!

Una vez completados todos los pasos, tu sistema estará **100% funcional** con:

✅ Sistema de planes de usuario
✅ Rate limiting por plan
✅ Solo ADMIN puede modificar planes
✅ Migraciones automáticas
✅ Cache distribuido con Redis
✅ Documentación API con Swagger
✅ Todas las mejoras implementadas

¡Felicitaciones! 🚀

