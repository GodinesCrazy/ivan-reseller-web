# 🎯 Configuración Railway - Paso a Paso Detallado

## 📍 Paso 1: Obtener DATABASE_URL desde Postgres

### 1.1 Acceder a Railway
1. Abre tu navegador
2. Ve a: **https://railway.app**
3. Inicia sesión si es necesario
4. Click en tu proyecto **"ivan-reseller"**

### 1.2 Localizar el Servicio Postgres
En la vista **"Architecture"** (vista de diagrama):
- Busca el recuadro con el ícono de **elefante 🐘** (Postgres)
- Puede estar etiquetado como **"Postgres"** o **"PostgreSQL"**
- **Click en ese recuadro**

### 1.3 Abrir la Pestaña Variables
En la parte superior del servicio Postgres, verás estas pestañas:
- **Deployments**
- **Variables** ← **CLICK AQUÍ**
- **Metrics**
- **Settings**

### 1.4 Buscar DATABASE_URL
En la lista de variables, busca una de estas:
- `DATABASE_URL` (más común)
- `DATABASE_PUBLIC_URL`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`

### 1.5 Ver y Copiar el Valor
1. Al lado del nombre de la variable, verás:
   - Un ícono de **ojo 👁️** (Show/Hide)
   - Un ícono de **copiar 📋** (Copy)

2. **Click en el ícono del ojo 👁️** para revelar el valor
   - El valor se mostrará (estará oculto por seguridad)
   - Ejemplo: `postgresql://postgres:ABC123xyz@containers-us-west-123.railway.app:5432/railway`

3. **Click en el ícono de copiar 📋** para copiar TODO el valor

4. **Pega en un documento temporal** o guárdalo (lo necesitarás después)

**✅ Verificación:**
- El valor debe empezar con `postgresql://` o `postgres://`
- Debe tener esta estructura: `postgresql://usuario:contraseña@host:puerto/base_datos`
- NO debe ser: `{{Postgres.DATABASE_URL}}` (eso es una referencia sin resolver)

---

## 📍 Paso 2: Obtener REDIS_URL desde Redis

### 2.1 Localizar el Servicio Redis
En la vista **"Architecture"**:
- Busca el recuadro con el ícono de **Redis** (logo rojo)
- Puede estar etiquetado como **"Redis"**
- **Click en ese recuadro**

### 2.2 Abrir Variables
1. Click en la pestaña **"Variables"**

### 2.3 Buscar REDIS_URL
En la lista, busca:
- `REDIS_URL` (más común)
- `REDISCLOUD_URL`

### 2.4 Ver y Copiar el Valor
1. **Click en el ícono del ojo 👁️** para ver el valor
2. **Click en el ícono de copiar 📋** para copiar
3. **Guarda el valor**

**✅ Verificación:**
- Debe empezar con `redis://`
- Ejemplo: `redis://default:ABC123xyz@containers-us-west-123.railway.app:6379`

---

## 📍 Paso 3: Generar JWT_SECRET

### 3.1 Abrir Terminal
- **Windows:** PowerShell o CMD
- **Mac/Linux:** Terminal

### 3.2 Ejecutar Comando
Copia y pega este comando:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Presiona **Enter**

### 3.3 Copiar el Resultado
- Verás una cadena de 64 caracteres (letras y números)
- Ejemplo: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2`
- **Copia TODO el resultado**
- **Guarda el valor**

**✅ Verificación:**
- Debe tener exactamente 64 caracteres
- Solo letras (a-f) y números (0-9)

---

## 📍 Paso 4: Configurar Variables en ivan-reseller-web

### 4.1 Ir al Servicio Backend
1. En Railway Dashboard, en la vista **"Architecture"**
2. Busca el recuadro **"ivan-reseller-web"** (ícono de GitHub 🐙)
3. **Click en ese recuadro**

### 4.2 Abrir Variables
1. Click en la pestaña **"Variables"** (parte superior)

### 4.3 Agregar DATABASE_URL

1. **Click en el botón "+ New Variable"**
   - Está en la esquina superior derecha
   - O puede estar en la parte superior de la lista de variables

2. Se abrirá un formulario con dos campos:
   - **Name:** (nombre de la variable)
   - **Value:** (valor de la variable)

3. En **"Name"**, escribe exactamente:
   ```
   DATABASE_URL
   ```
   - ⚠️ Importante: Mayúsculas, sin espacios

4. En **"Value"**, pega el valor que copiaste del Postgres (Paso 1.5)

5. **Click en "Add"** o **"Save"**

**✅ Verificación:**
- La variable `DATABASE_URL` debe aparecer en la lista
- El valor debe empezar con `postgresql://`

### 4.4 Agregar REDIS_URL

1. **Click en "+ New Variable"** nuevamente

2. **Name:** `REDIS_URL`

3. **Value:** Pega el valor que copiaste del Redis (Paso 2.4)

4. **Click en "Add"**

**✅ Verificación:**
- La variable `REDIS_URL` debe aparecer en la lista
- El valor debe empezar con `redis://`

### 4.5 Agregar JWT_SECRET

1. **Click en "+ New Variable"**

2. **Name:** `JWT_SECRET`

3. **Value:** Pega el valor que generaste (Paso 3.3)

4. **Click en "Add"**

**✅ Verificación:**
- La variable `JWT_SECRET` debe aparecer
- El valor debe tener 64 caracteres

### 4.6 Agregar NODE_ENV

1. **Click en "+ New Variable"**

2. **Name:** `NODE_ENV`

3. **Value:** `production`

4. **Click en "Add"**

### 4.7 Agregar API_URL

1. **Click en "+ New Variable"**

2. **Name:** `API_URL`

3. **Value:** 
   - Primero, ve a **Settings** (pestaña en ivan-reseller-web)
   - Busca **"Public Domain"** o **"Custom Domain"**
   - Copia la URL (ej: `ivan-reseller-web-production.up.railway.app`)
   - Vuelve a **Variables**
   - Pega la URL con `https://` al inicio:
     ```
     https://ivan-reseller-web-production.up.railway.app
     ```

4. **Click en "Add"**

### 4.8 Agregar CORS_ORIGIN

1. **Click en "+ New Variable"**

2. **Name:** `CORS_ORIGIN`

3. **Value:** 
   - Si tienes frontend en Railway, copia su URL
   - Si es local: `http://localhost:5173`
   - Si es otro dominio: `https://tu-dominio.com`

4. **Click en "Add"**

### 4.9 Verificar Todas las Variables

Tu lista de variables debe incluir (mínimo):

```
✅ DATABASE_URL = postgresql://postgres:xxxxx@...
✅ REDIS_URL = redis://default:xxxxx@...
✅ JWT_SECRET = a1b2c3d4e5f6g7h8...
✅ NODE_ENV = production
✅ API_URL = https://ivan-reseller-web-production.up.railway.app
✅ CORS_ORIGIN = https://tu-frontend.railway.app
```

---

## 📍 Paso 5: Hacer Deployment

### Opción A: Deployment Automático (Si tienes GitHub conectado)

1. **Abre tu terminal local**

2. **Navega a tu proyecto:**
   ```bash
   cd C:\Ivan_Reseller_Web
   ```

3. **Agrega todos los cambios:**
   ```bash
   git add .
   ```

4. **Haz commit:**
   ```bash
   git commit -m "feat: Sistema de planes de usuario y mejoras completas"
   ```

5. **Push a GitHub:**
   ```bash
   git push origin main
   ```

6. **Railway detectará automáticamente el push**
   - Ve a Railway Dashboard
   - Verás un nuevo deployment iniciándose

### Opción B: Deployment Manual

1. En Railway Dashboard, ve a **ivan-reseller-web**

2. Click en la pestaña **"Deployments"**

3. Busca el botón **"Redeploy"** o **"Deploy"**
   - Puede estar en la parte superior
   - O en el menú de tres puntos (⋯) del deployment actual

4. **Click en "Redeploy"**

5. Railway iniciará un nuevo deployment

### 5.1 Monitorear el Deployment

1. En la pestaña **"Deployments"**, verás una lista de deployments

2. El más reciente estará en la parte superior

3. **Click en el deployment más reciente**

4. Verás los logs en tiempo real

**Lo que deberías ver (en orden):**

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

**⏱️ Tiempo estimado:** 2-5 minutos

---

## 📍 Paso 6: Verificar que Funciona

### 6.1 Health Check

1. Ve a **ivan-reseller-web** → **Settings**

2. Busca **"Public Domain"** o **"Custom Domain"**

3. Copia la URL (ej: `ivan-reseller-web-production.up.railway.app`)

4. Abre en tu navegador:
   ```
   https://ivan-reseller-web-production.up.railway.app/health
   ```

5. **Deberías ver:**
   ```json
   {
     "status": "ok",
     "timestamp": "2025-11-13T00:39:00.000Z",
     "environment": "production"
   }
   ```

**✅ Si ves esto, el servidor está funcionando correctamente**

### 6.2 Verificar Swagger (Opcional)

1. Abre en el navegador:
   ```
   https://tu-url.railway.app/api-docs
   ```

2. Deberías ver la documentación interactiva de la API

**Nota:** Swagger solo se muestra si `NODE_ENV !== 'production'` o si `ENABLE_SWAGGER=true`

### 6.3 Verificar Logs

1. Ve a **ivan-reseller-web** → **Deployments**

2. Click en el deployment activo (el que dice **"ACTIVE"** en verde)

3. Click en **"View logs"**

4. Busca estos mensajes de éxito:

```
✅ DATABASE_URL encontrada
✅ Migrations applied successfully
✅ Database connected
✅ Redis connected
✅ Server running on port...
```

**✅ Si ves todos estos mensajes, todo está funcionando correctamente**

### 6.4 Verificar Campo `plan` (Opcional)

**Opción 1: Desde Prisma Studio (Local)**

1. Abre terminal
2. Ejecuta:
   ```bash
   cd backend
   npx prisma studio
   ```
3. Se abrirá Prisma Studio en el navegador
4. Click en la tabla **"users"**
5. Verifica que exista la columna **"plan"**
6. Verifica que los usuarios tengan `plan = "FREE"` por defecto

**Opción 2: Desde Railway CLI**

```bash
railway run npx prisma studio
```

---

## 🚨 Solución de Problemas Detallada

### Problema 1: "DATABASE_URL no encontrada"

**Síntomas:**
```
❌ ERROR: DATABASE_URL no está configurada
```

**Pasos para resolver:**

1. **Verificar que existe:**
   - Ve a **ivan-reseller-web** → **Variables**
   - Busca `DATABASE_URL` en la lista
   - Si NO existe, agrégalo (Paso 4.3)

2. **Verificar el nombre:**
   - Debe ser exactamente `DATABASE_URL` (sin espacios)
   - Case-sensitive (mayúsculas)

3. **Verificar el valor:**
   - Click en el ícono del ojo 👁️ para ver el valor
   - Debe empezar con `postgresql://` o `postgres://`
   - NO debe ser `{{Postgres.DATABASE_URL}}`

4. **Si es una referencia sin resolver:**
   - Ve a **Postgres** → **Variables**
   - Copia el valor REAL de `DATABASE_URL`
   - Pégala manualmente en **ivan-reseller-web** → **Variables**

### Problema 2: "Redis connection failed"

**Síntomas:**
```
❌ Redis connection failed
⚠️ Redis no configurado, continuando sin Redis
```

**Pasos para resolver:**

1. **Verificar que existe:**
   - Ve a **ivan-reseller-web** → **Variables**
   - Busca `REDIS_URL`
   - Si NO existe, agrégalo (Paso 4.4)

2. **Verificar el valor:**
   - Debe empezar con `redis://`

3. **Verificar que Redis esté activo:**
   - Ve a **Redis** → **Deployments**
   - Verifica que haya un deployment activo

**Nota:** El sistema funcionará sin Redis, pero sin cache distribuido.

### Problema 3: "JWT_SECRET must be at least 32 characters"

**Síntomas:**
```
❌ ERROR DE VALIDACIÓN:
   - JWT_SECRET: String must contain at least 32 character(s)
```

**Pasos para resolver:**

1. **Generar nuevo JWT_SECRET:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Actualizar en Railway:**
   - Ve a **ivan-reseller-web** → **Variables**
   - Busca `JWT_SECRET`
   - Click en el ícono de editar (lápiz ✏️)
   - Pega el nuevo valor (64 caracteres)
   - Click en **"Save"**

3. **Reiniciar el servicio:**
   - Railway reiniciará automáticamente
   - O haz un nuevo deployment

### Problema 4: "Migration failed"

**Síntomas:**
```
❌ Migration failed
⚠️ db push también falló
```

**Pasos para resolver:**

1. **Verificar DATABASE_URL:**
   - Debe estar correctamente configurada
   - Debe ser accesible desde Railway

2. **Verificar conexión:**
   - Revisa los logs para ver el error específico
   - Puede ser: "Connection refused", "Authentication failed", etc.

3. **Ejecutar migración manualmente:**
   ```bash
   # Instalar Railway CLI
   npm i -g @railway/cli
   
   # Login
   railway login
   
   # Ejecutar migración
   railway run npx prisma migrate deploy
   ```

4. **Si persiste el problema:**
   - Verifica que la base de datos esté activa
   - Verifica que las credenciales sean correctas
   - Contacta soporte de Railway si es necesario

---

## ✅ Checklist Final

Antes de considerar el sistema 100% funcional, verifica:

### Variables Configuradas:
- [ ] `DATABASE_URL` existe y empieza con `postgresql://`
- [ ] `REDIS_URL` existe y empieza con `redis://`
- [ ] `JWT_SECRET` existe y tiene 64 caracteres
- [ ] `NODE_ENV` = `production`
- [ ] `API_URL` configurada correctamente
- [ ] `CORS_ORIGIN` configurada correctamente

### Deployment:
- [ ] Deployment completado exitosamente
- [ ] Logs muestran "✅ Database connected"
- [ ] Logs muestran "✅ Redis connected"
- [ ] Logs muestran "✅ Server running"

### Verificación:
- [ ] Health check responde: `/health`
- [ ] No hay errores críticos en los logs
- [ ] Campo `plan` existe en la base de datos (opcional verificar)

---

## 🎉 ¡Listo!

Una vez completados todos los pasos y verificaciones, tu sistema estará **100% funcional** con:

✅ Sistema de planes de usuario
✅ Rate limiting por plan
✅ Solo ADMIN puede modificar planes
✅ Migraciones automáticas
✅ Cache distribuido
✅ Todas las mejoras implementadas

---

## 📞 ¿Necesitas Más Ayuda?

Si encuentras algún problema:

1. **Revisa los logs** en Railway → Deployments → View logs
2. **Ejecuta verificación local:**
   ```bash
   cd backend
   npm run verify
   ```
3. **Revisa la documentación:**
   - `GUIA_PASO_A_PASO_RAILWAY.md` (esta guía)
   - `CONFIGURACION_RAILWAY_COMPLETA.md`
   - `VERIFICACION_SISTEMA_COMPLETA.md`

¡Éxito con tu deployment! 🚀

