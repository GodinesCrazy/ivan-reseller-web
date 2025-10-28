# 🚀 Deployment Paso a Paso - Ivan Reseller Web

## ✅ Paso 1: Código en GitHub
- [x] Git init
- [x] Commit inicial
- [x] Push a GitHub (en progreso...)

---

## 🚂 Paso 2: Railway - Backend + PostgreSQL + Redis

### A. Crear Proyecto en Railway

1. Ve a https://railway.app
2. Click en **"Start a New Project"**
3. Selecciona **"Deploy from GitHub repo"**
4. Busca y selecciona: **`GodinesCrazy/ivan_reseller2`**
5. Railway detectará Node.js automáticamente

### B. Configurar el Backend

1. En tu proyecto Railway, click en el servicio que se creó
2. Ve a **"Settings"**
3. En **"Service Name"** ponle: `backend`
4. En **"Root Directory"** pon: `backend`

### C. Configurar Build Commands

En **"Settings"** → **"Build & Deploy"**:
- **Build Command:** `npm install && npx prisma generate`
- **Start Command:** `npm run start`

### D. Agregar PostgreSQL

1. En tu proyecto Railway, click en **"+ New"**
2. Selecciona **"Database"** → **"PostgreSQL"**
3. Railway conecta automáticamente el `DATABASE_URL`

### E. Agregar Redis

1. Click en **"+ New"** nuevamente
2. Selecciona **"Database"** → **"Redis"**
3. Railway conecta automáticamente el `REDIS_URL`

### F. Variables de Entorno

1. Click en tu servicio `backend`
2. Ve a **"Variables"**
3. Añade estas variables manualmente:

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=ivan-reseller-super-secure-jwt-secret-key-2025-minimum-32-chars
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*
```

**Nota:** `DATABASE_URL` y `REDIS_URL` se crean automáticamente al añadir las bases de datos.

### G. Ejecutar Migraciones

1. Una vez deployado, ve a tu servicio `backend`
2. Click en **"Settings"** → **"Deployments"**
3. Click en el deployment más reciente
4. Abre la **consola** (terminal icon)
5. Ejecuta:
```bash
npx prisma migrate deploy
npx prisma db seed
```

### H. Obtener URL del Backend

1. Ve a **"Settings"** → **"Networking"**
2. Click en **"Generate Domain"**
3. Railway te dará algo como: `backend-production-xxxx.up.railway.app`
4. **Copia esta URL** (la necesitarás para Vercel)

---

## ▲ Paso 3: Vercel - Frontend

### A. Importar Proyecto

1. Ve a https://vercel.com/new
2. Click en **"Import Git Repository"**
3. Selecciona: **`GodinesCrazy/ivan_reseller2`**
4. Click en **"Import"**

### B. Configurar Framework

Vercel detectará Vite automáticamente. Verifica:
- **Framework Preset:** `Vite`
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

### C. Variables de Entorno

En **"Environment Variables"** añade:

```env
VITE_API_URL=https://tu-backend-railway.up.railway.app
```

**Reemplaza** `tu-backend-railway.up.railway.app` con la URL que copiaste de Railway.

### D. Deploy

1. Click en **"Deploy"**
2. Espera ~2-3 minutos
3. Vercel te dará una URL como: `ivan-reseller-xxxx.vercel.app`

---

## 🔄 Paso 4: Actualizar CORS en Railway

1. Vuelve a Railway
2. Abre tu servicio `backend`
3. Ve a **"Variables"**
4. Encuentra `CORS_ORIGIN`
5. Cámbialo de `*` a tu URL de Vercel:
```env
CORS_ORIGIN=https://ivan-reseller-xxxx.vercel.app
```
6. El servicio se redesployará automáticamente

---

## ✅ Paso 5: Verificar Deployment

### A. Probar Backend

Abre en tu navegador:
```
https://tu-backend-railway.up.railway.app
```

Deberías ver: `{"message":"Ivan Reseller API","status":"ok"}`

### B. Probar Frontend

Abre en tu navegador:
```
https://ivan-reseller-xxxx.vercel.app
```

Deberías ver la página de login.

### C. Login de Prueba

Usa las credenciales del seed:
- **Usuario:** `demo`
- **Contraseña:** `demo123`

---

## 🎉 ¡Listo! Tu Sitio Está en Vivo

Ahora puedes compartir el link con cualquier persona en el mundo:
```
https://ivan-reseller-xxxx.vercel.app
```

---

## 🔧 Troubleshooting

### Error: "Cannot connect to API"

1. Verifica que `VITE_API_URL` en Vercel esté correcto
2. Verifica que `CORS_ORIGIN` en Railway esté correcto
3. Redesploya frontend en Vercel

### Error: "Database connection failed"

1. En Railway, verifica que PostgreSQL esté corriendo
2. Verifica que `DATABASE_URL` esté en las variables
3. Ejecuta migraciones: `npx prisma migrate deploy`

### Error: "Login failed"

1. Verifica que ejecutaste el seed: `npx prisma db seed`
2. Revisa logs en Railway para ver errores

---

## 📊 Monitoreo

### Railway
- **Logs:** Ve a tu servicio → "Deployments" → Click en deployment → "View Logs"
- **Métricas:** CPU, RAM, Network en el dashboard

### Vercel
- **Analytics:** Dashboard de Vercel → Analytics
- **Logs:** Dashboard → Deployments → Click en deployment → "Functions Logs"

---

## 💰 Costos

- **Railway:** $5 crédito gratis/mes
- **Vercel:** Ilimitado gratis para proyectos personales

**Total:** $0/mes si no excedes los límites gratuitos

---

## 🔄 Actualizaciones Futuras

Cada vez que hagas cambios:

```bash
git add .
git commit -m "Tu mensaje de cambio"
git push
```

Railway y Vercel automáticamente:
1. Detectan el push
2. Rebuildan el proyecto
3. Redesployan en ~2-5 minutos

---

**¿Listo para empezar? Sigue los pasos en orden y avísame si necesitas ayuda.** 🚀
