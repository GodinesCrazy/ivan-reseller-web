# ✅ Verificación Completa del Sistema - Railway

## 📋 Checklist de Configuración

### 1. Variables de Entorno en Railway

#### Servicio: **ivan-reseller-web**

Verifica que estas variables estén configuradas:

- [ ] **DATABASE_URL** 
  - ✅ Debe existir
  - ✅ Debe empezar con `postgresql://`
  - ✅ Debe venir del servicio Postgres

- [ ] **REDIS_URL**
  - ✅ Debe existir
  - ✅ Debe empezar con `redis://`
  - ✅ Debe venir del servicio Redis

- [ ] **JWT_SECRET**
  - ✅ Debe existir
  - ✅ Debe tener al menos 32 caracteres

- [ ] **NODE_ENV**
  - ✅ Debe ser `production`

- [ ] **PORT**
  - ✅ Railway lo asigna automáticamente (usar `$PORT` si es necesario)

- [ ] **API_URL**
  - ✅ Debe ser la URL de tu backend: `https://ivan-reseller-web-production.up.railway.app`

- [ ] **CORS_ORIGIN**
  - ✅ Debe ser la URL de tu frontend

---

## 🔧 Cómo Configurar en Railway

### Paso 1: Obtener DATABASE_URL

1. Ve a tu proyecto en Railway
2. Click en el servicio **Postgres**
3. Ve a la pestaña **"Variables"**
4. Busca `DATABASE_URL` o `DATABASE_PUBLIC_URL`
5. Click en el ícono del ojo 👁️ para VER el valor completo
6. Click en copiar 📋
7. Ve a **ivan-reseller-web** → **Variables**
8. Agrega o edita `DATABASE_URL`
9. Pega el valor completo

**Formato esperado:**
```
postgresql://postgres:xxxxx@containers-us-west-123.railway.app:5432/railway
```

### Paso 2: Obtener REDIS_URL

1. Ve a tu proyecto en Railway
2. Click en el servicio **Redis**
3. Ve a la pestaña **"Variables"**
4. Busca `REDIS_URL`
5. Click en el ícono del ojo 👁️ para VER el valor completo
6. Click en copiar 📋
7. Ve a **ivan-reseller-web** → **Variables**
8. Agrega o edita `REDIS_URL`
9. Pega el valor completo

**Formato esperado:**
```
redis://default:xxxxx@containers-us-west-123.railway.app:6379
```

### Paso 3: Generar JWT_SECRET

Ejecuta en tu terminal local:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copia el resultado y pégalo en Railway:
1. Ve a **ivan-reseller-web** → **Variables**
2. Agrega `JWT_SECRET`
3. Pega el valor generado

### Paso 4: Configurar Variables del Servidor

En **ivan-reseller-web** → **Variables**, agrega:

```env
NODE_ENV=production
API_URL=https://ivan-reseller-web-production.up.railway.app
CORS_ORIGIN=https://tu-frontend.railway.app
```

---

## 🚀 Scripts de Inicio

El sistema está configurado para ejecutar migraciones automáticamente:

- **`start:with-migrations`**: Ejecuta `prisma migrate deploy` antes de iniciar el servidor
- **Railway usará este script** automáticamente gracias a `railway.json` y `Procfile`

---

## ✅ Verificación Post-Deployment

### 1. Verificar Logs

1. Ve a **ivan-reseller-web** → **Deployments**
2. Click en el deployment más reciente
3. Click en **"View logs"**
4. Busca estos mensajes:

```
✅ DATABASE_URL encontrada
✅ Redis connected
🔄 Running database migrations...
✅ Database connected
✅ Server running on port...
```

### 2. Verificar Migración del Campo `plan`

En los logs, deberías ver:
```
✅ Migrations applied successfully
```

O si es la primera vez:
```
✅ Creating migration add_user_plan_field
✅ Migration applied
```

### 3. Verificar que el Servidor Está Activo

1. Ve a **ivan-reseller-web** → **Settings**
2. Busca la URL pública (ej: `ivan-reseller-web-production.up.railway.app`)
3. Abre en el navegador: `https://tu-url.railway.app/health`
4. Deberías ver:
```json
{
  "status": "ok",
  "timestamp": "...",
  "environment": "production"
}
```

### 4. Verificar Swagger (Opcional)

Si `ENABLE_SWAGGER=true` o estás en desarrollo:
- Abre: `https://tu-url.railway.app/api-docs`
- Deberías ver la documentación de la API

---

## 🔍 Comandos de Verificación

### Verificar Variables en Railway (desde terminal)

```bash
# Instalar Railway CLI
npm i -g @railway/cli

# Login
railway login

# Ver variables
railway variables
```

### Verificar Base de Datos Localmente

```bash
cd backend
npx prisma studio
```

Esto abrirá Prisma Studio donde puedes ver todas las tablas y datos.

---

## 🚨 Solución de Problemas

### Error: "DATABASE_URL no encontrada"

**Solución:**
1. Verifica que `DATABASE_URL` existe en **ivan-reseller-web** → **Variables**
2. Verifica que el valor empiece con `postgresql://`
3. Verifica que no sea una referencia sin resolver: `{{Postgres.DATABASE_URL}}`
4. Si es una referencia, cópiala manualmente desde Postgres → Variables

### Error: "Redis connection failed"

**Solución:**
1. Verifica que `REDIS_URL` existe en **ivan-reseller-web** → **Variables**
2. Verifica que el valor empiece con `redis://`
3. Verifica que el servicio Redis esté activo

### Error: "JWT_SECRET must be at least 32 characters"

**Solución:**
1. Genera un nuevo JWT_SECRET de 32+ caracteres
2. Actualiza la variable en Railway
3. Reinicia el servicio

### Error: "Migration failed"

**Solución:**
1. Verifica que `DATABASE_URL` esté correctamente configurada
2. Verifica que la base de datos esté accesible
3. Revisa los logs para ver el error específico
4. Si es necesario, ejecuta manualmente:
   ```bash
   railway run npx prisma migrate deploy
   ```

---

## 📊 Estado Final Esperado

Una vez configurado correctamente:

✅ **Base de datos:**
- Tabla `users` con campo `plan` (default: "FREE")
- Todas las migraciones aplicadas

✅ **Redis:**
- Conectado y funcionando
- Cache distribuido activo

✅ **Servidor:**
- Corriendo en el puerto asignado por Railway
- Health check respondiendo
- Swagger disponible (si está habilitado)

✅ **Rate Limiting:**
- Funcionando con límites por plan
- Cache de planes activo

---

## 🎯 Próximos Pasos

1. ✅ Configurar todas las variables en Railway
2. ✅ Hacer un nuevo deployment
3. ✅ Verificar logs
4. ✅ Probar endpoints
5. ✅ Verificar que el campo `plan` existe en la tabla `users`

