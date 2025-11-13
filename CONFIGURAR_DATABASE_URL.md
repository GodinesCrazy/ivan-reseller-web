# Cómo Configurar DATABASE_URL

## 📋 Formato de DATABASE_URL

La `DATABASE_URL` debe tener el siguiente formato:

```
postgresql://usuario:contraseña@host:puerto/nombre_base_datos
```

Ejemplo:
```
postgresql://postgres:mi_password123@localhost:5432/ivan_reseller
```

---

## 🖥️ Configuración Local (Desarrollo)

### Opción 1: PostgreSQL Local

1. **Instalar PostgreSQL** (si no lo tienes):
   - Windows: Descarga desde [postgresql.org](https://www.postgresql.org/download/windows/)
   - O usa Docker: `docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres`

2. **Crear base de datos**:
   ```sql
   CREATE DATABASE ivan_reseller;
   ```

3. **Crear archivo `.env` en `backend/`**:
   ```env
   DATABASE_URL=postgresql://postgres:tu_password@localhost:5432/ivan_reseller
   ```

### Opción 2: Usar Railway PostgreSQL (Recomendado para desarrollo)

1. Ve a [Railway Dashboard](https://railway.app)
2. Crea un nuevo proyecto PostgreSQL
3. Ve a **Variables** → Busca `DATABASE_URL` o `DATABASE_PUBLIC_URL`
4. Copia el valor completo
5. Pega en tu archivo `backend/.env`:
   ```env
   DATABASE_URL=postgresql://postgres:xxxxx@xxxxx.railway.app:5432/railway
   ```

---

## ☁️ Configuración en Railway (Producción)

### Paso 1: Crear Servicio PostgreSQL en Railway

1. Ve a tu proyecto en Railway
2. Click en **"+ New"** → **"Database"** → **"Add PostgreSQL"**
3. Railway creará automáticamente un servicio PostgreSQL

### Paso 2: Obtener DATABASE_URL

1. Click en el servicio **PostgreSQL** que acabas de crear
2. Ve a la pestaña **"Variables"**
3. Busca una de estas variables:
   - `DATABASE_URL`
   - `DATABASE_PUBLIC_URL`
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`

4. **IMPORTANTE**: Click en el ícono del ojo 👁️ para **VER** el valor completo
5. Click en el ícono de copiar 📋 para copiar TODO el valor

### Paso 3: Configurar en el Servicio Backend

1. Ve a tu servicio **ivan-reseller-web** (o el nombre de tu backend)
2. Ve a la pestaña **"Variables"**
3. Click en **"+ New Variable"**
4. Nombre: `DATABASE_URL`
5. Valor: Pega el valor que copiaste del servicio PostgreSQL
6. Click en **"Add"**

### Paso 4: Verificar

El formato debe ser:
```
postgresql://postgres:contraseña@host.railway.app:puerto/railway
```

**NO debe ser:**
- ❌ `{{Postgres.DATABASE_URL}}` (referencia sin resolver)
- ❌ `postgresql://` (incompleto)
- ❌ Solo el host sin credenciales

---

## 🔍 Verificar que está Configurado Correctamente

### En Local:

```bash
cd backend
node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL ? '✅ Configurado' : '❌ No configurado')"
```

### En Railway:

1. Ve a tu servicio backend → **"Deployments"**
2. Click en el deployment más reciente
3. Revisa los logs al inicio
4. Deberías ver:
   ```
   🔍 DATABASE_URL encontrada:
      Variable: DATABASE_URL
      postgresql://postgres:***@xxxxx.railway.app:5432/railway
   ```

---

## 🚨 Solución de Problemas

### Error: "DATABASE_URL no encontrada"

**Solución:**
1. Verifica que el archivo `.env` existe en `backend/`
2. Verifica que la variable se llama exactamente `DATABASE_URL`
3. Verifica que no hay espacios extra: `DATABASE_URL = ...` (debe ser `DATABASE_URL=...`)

### Error: "URL must start with postgresql:// or postgres://"

**Solución:**
1. Verifica que la URL empieza con `postgresql://` o `postgres://`
2. Si usas Railway, asegúrate de copiar el valor COMPLETO, no solo una referencia

### Error: "DATABASE_URL está incompleta"

**Solución:**
1. La URL debe incluir:
   - Protocolo: `postgresql://`
   - Usuario: `postgres`
   - Contraseña: `xxxxx`
   - Host: `xxxxx.railway.app`
   - Puerto: `5432`
   - Base de datos: `railway`

Ejemplo completo:
```
postgresql://postgres:ABC123xyz@containers-us-west-123.railway.app:5432/railway
```

---

## 📝 Ejemplo de archivo `.env` completo

```env
# Base de datos
DATABASE_URL=postgresql://postgres:tu_password@localhost:5432/ivan_reseller

# Redis (opcional)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=tu_secret_key_muy_larga_y_segura_de_al_menos_32_caracteres
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Servidor
NODE_ENV=development
PORT=3001
API_URL=http://localhost:3001

# CORS
CORS_ORIGIN=http://localhost:5173

# APIs externas (opcionales)
EBAY_APP_ID=tu_app_id
EBAY_DEV_ID=tu_dev_id
EBAY_CERT_ID=tu_cert_id
```

---

## ✅ Después de Configurar

Una vez que tengas `DATABASE_URL` configurada, ejecuta:

```bash
cd backend
npx prisma migrate dev --name add_user_plan_field
```

Esto creará la migración y aplicará los cambios a la base de datos.

