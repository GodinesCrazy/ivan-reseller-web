# 🚀 Configuración Completa de Railway - Ivan Reseller

## 📋 Servicios Necesarios

Según tu configuración en Railway, tienes:
1. ✅ **ivan-reseller-web** (Backend)
2. ✅ **Postgres** (Base de datos)
3. ✅ **Redis** (Cache)

---

## 🔧 Variables de Entorno Requeridas

### Para el Servicio: **ivan-reseller-web**

#### 1. DATABASE_URL (CRÍTICO)
- **Cómo obtenerla:**
  1. Ve a tu servicio **Postgres** en Railway
  2. Click en la pestaña **"Variables"**
  3. Busca `DATABASE_URL` o `DATABASE_PUBLIC_URL`
  4. Click en el ícono del ojo 👁️ para VER el valor
  5. Click en copiar 📋
  6. Ve a **ivan-reseller-web** → **Variables**
  7. Agrega o edita `DATABASE_URL`
  8. Pega el valor completo

- **Formato esperado:**
  ```
  postgresql://postgres:xxxxx@xxxxx.railway.app:5432/railway
  ```

#### 2. REDIS_URL (CRÍTICO)
- **Cómo obtenerla:**
  1. Ve a tu servicio **Redis** en Railway
  2. Click en la pestaña **"Variables"**
  3. Busca `REDIS_URL`
  4. Click en el ícono del ojo 👁️ para VER el valor
  5. Click en copiar 📋
  6. Ve a **ivan-reseller-web** → **Variables**
  7. Agrega o edita `REDIS_URL`
  8. Pega el valor completo

- **Formato esperado:**
  ```
  redis://default:xxxxx@xxxxx.railway.app:6379
  ```

#### 3. JWT_SECRET (CRÍTICO)
- **Valor:** Una cadena aleatoria de al menos 32 caracteres
- **Generar:**
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Ejemplo:**
  ```
  a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
  ```

#### 4. Variables del Servidor
```env
NODE_ENV=production
PORT=3001
API_URL=https://tu-backend.railway.app
CORS_ORIGIN=https://tu-frontend.railway.app
```

#### 5. Variables Opcionales (APIs Externas)
```env
# eBay
EBAY_APP_ID=tu_app_id
EBAY_DEV_ID=tu_dev_id
EBAY_CERT_ID=tu_cert_id

# MercadoLibre
MERCADOLIBRE_CLIENT_ID=tu_client_id
MERCADOLIBRE_CLIENT_SECRET=tu_client_secret

# PayPal
PAYPAL_CLIENT_ID=tu_client_id
PAYPAL_CLIENT_SECRET=tu_client_secret
PAYPAL_ENVIRONMENT=production

# Groq AI
GROQ_API_KEY=tu_api_key

# ScraperAPI
SCRAPERAPI_KEY=tu_api_key
```

---

## 📝 Checklist de Configuración

### Paso 1: Configurar Postgres → Backend
- [ ] Ir a servicio **Postgres** → **Variables**
- [ ] Copiar `DATABASE_URL` o `DATABASE_PUBLIC_URL`
- [ ] Ir a servicio **ivan-reseller-web** → **Variables**
- [ ] Agregar/editar `DATABASE_URL` con el valor copiado
- [ ] Verificar que empiece con `postgresql://`

### Paso 2: Configurar Redis → Backend
- [ ] Ir a servicio **Redis** → **Variables**
- [ ] Copiar `REDIS_URL`
- [ ] Ir a servicio **ivan-reseller-web** → **Variables**
- [ ] Agregar/editar `REDIS_URL` con el valor copiado
- [ ] Verificar que empiece con `redis://`

### Paso 3: Configurar JWT_SECRET
- [ ] Generar un JWT_SECRET seguro (32+ caracteres)
- [ ] Ir a servicio **ivan-reseller-web** → **Variables**
- [ ] Agregar `JWT_SECRET` con el valor generado

### Paso 4: Configurar Variables del Servidor
- [ ] `NODE_ENV=production`
- [ ] `PORT=3001` (o el puerto que Railway asigne)
- [ ] `API_URL=https://ivan-reseller-web-production.up.railway.app`
- [ ] `CORS_ORIGIN=https://tu-frontend.railway.app`

### Paso 5: Ejecutar Migración
Una vez configuradas las variables, la migración se ejecutará automáticamente en el próximo deployment, O puedes ejecutarla manualmente:

1. Ve a **ivan-reseller-web** → **Deployments**
2. Click en el deployment activo
3. Click en **"View logs"**
4. Busca mensajes de Prisma

---

## 🔍 Verificación

### Verificar que DATABASE_URL está configurada:
1. Ve a **ivan-reseller-web** → **Variables**
2. Busca `DATABASE_URL`
3. Debe existir y empezar con `postgresql://`

### Verificar que Redis está configurado:
1. Ve a **ivan-reseller-web** → **Variables**
2. Busca `REDIS_URL`
3. Debe existir y empezar con `redis://`

### Verificar logs del servidor:
1. Ve a **ivan-reseller-web** → **Deployments** → **View logs**
2. Busca estos mensajes:
   - ✅ `✅ Redis connected`
   - ✅ `✅ Database connected`
   - ✅ `Server running on port...`

---

## 🚨 Solución de Problemas

### Error: "DATABASE_URL no encontrada"
- Verifica que la variable existe en **ivan-reseller-web** → **Variables**
- Verifica que el nombre sea exactamente `DATABASE_URL` (case-sensitive)
- Verifica que el valor empiece con `postgresql://`

### Error: "Redis connection failed"
- Verifica que `REDIS_URL` existe en **ivan-reseller-web** → **Variables**
- Verifica que el valor empiece con `redis://`
- Verifica que el servicio Redis esté activo

### Error: "JWT_SECRET must be at least 32 characters"
- Genera un nuevo JWT_SECRET de al menos 32 caracteres
- Actualiza la variable en Railway

---

## 📌 Notas Importantes

1. **Variable References en Railway:**
   - Railway permite usar `{{Postgres.DATABASE_URL}}` como referencia
   - PERO, a veces no se resuelve correctamente
   - **Recomendación:** Copia el valor real en lugar de usar la referencia

2. **Migraciones:**
   - Las migraciones se ejecutan automáticamente si tienes `prisma migrate deploy` en tu script de inicio
   - O puedes ejecutarlas manualmente desde los logs

3. **Cache:**
   - El sistema usa Redis para cache distribuido
   - Si Redis no está disponible, usa cache en memoria como fallback

---

## ✅ Estado Final Esperado

Una vez configurado correctamente, deberías ver en los logs:

```
✅ DATABASE_URL encontrada
✅ Redis connected
✅ Database connected
✅ Server running on port 3001
```

Y el sistema debería estar 100% funcional.

