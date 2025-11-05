# 🚂 DEPLOYMENT EN RAILWAY - PROYECTO ESPECÍFICO

**Repositorio:** `GodinesCrazy/ivan-reseller-web`

---

## 🚀 CONFIGURACIÓN RÁPIDA EN RAILWAY

### **Paso 1: Crear Proyecto**

1. Ve a: https://railway.app
2. Login con GitHub
3. Click **"New Project"**
4. Selecciona **"Deploy from GitHub repo"**
5. Busca: `GodinesCrazy/ivan-reseller-web`
6. Click en el repositorio

---

### **Paso 2: Configurar Backend**

Railway detectará automáticamente que es un proyecto Node.js.

**Configuración del Servicio:**
- ✅ **Service Name:** `backend` (o déjalo como está)
- ✅ **Root Directory:** `backend`
- ✅ **Build Command:** `npm install && npm run build`
- ✅ **Start Command:** `npm start`

**Dónde configurar:**
- Railway Dashboard → Tu servicio → **Settings** → **Build & Deploy**

---

### **Paso 3: Agregar PostgreSQL**

1. En tu proyecto Railway, click **"+ New"**
2. Selecciona **"Database"** → **"PostgreSQL"**
3. Railway crea automáticamente `DATABASE_URL`
4. El servicio backend se conectará automáticamente

---

### **Paso 4: Agregar Redis (Recomendado)**

1. Click **"+ New"** nuevamente
2. Selecciona **"Database"** → **"Redis"**
3. Railway crea automáticamente `REDIS_URL`
4. El servicio backend se conectará automáticamente

**Nota:** Si no agregas Redis, los cron jobs no funcionarán, pero el sistema seguirá funcionando.

---

### **Paso 5: Configurar Variables de Entorno**

Railway Dashboard → Tu servicio backend → **"Variables"** → **"Add Variable"**

**Variables OBLIGATORIAS:**
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=[GENERA UNO - VER ABAJO]
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
LOG_LEVEL=info
```

**Generar JWT_SECRET:**
```powershell
# En PowerShell:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Variables AUTO-GENERADAS (no necesitas agregarlas):**
- `DATABASE_URL` - Se crea automáticamente al agregar PostgreSQL
- `REDIS_URL` - Se crea automáticamente al agregar Redis

**Variables OPCIONALES (pero recomendadas):**
```env
PAYPAL_CLIENT_ID=tu_client_id
PAYPAL_CLIENT_SECRET=tu_client_secret
PAYPAL_ENVIRONMENT=production
```

---

### **Paso 6: Obtener URL del Backend**

1. Railway Dashboard → Tu servicio backend → **"Settings"** → **"Networking"**
2. Click **"Generate Domain"**
3. Railway te dará una URL como: `https://ivan-reseller-web-production.up.railway.app`
4. **Copia esta URL** - La necesitarás para Vercel

---

### **Paso 7: Verificar Deployment**

1. Espera a que Railway termine el build (2-5 minutos)
2. Abre la URL que Railway te dio
3. Agrega `/health` al final: `https://tu-url.up.railway.app/health`
4. Debería mostrar: `{"status":"ok"}`

---

## 🔄 ACTUALIZAR CORS DESPUÉS DE VERCEL

Una vez que tengas la URL de Vercel:

1. Railway Dashboard → Tu servicio backend → **"Variables"**
2. Encuentra `CORS_ORIGIN`
3. Actualiza a:
```env
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,https://tu-proyecto.vercel.app
```
4. Railway se redesplegará automáticamente

---

## 📋 CHECKLIST

- [ ] Proyecto creado en Railway
- [ ] Repositorio conectado: `GodinesCrazy/ivan-reseller-web`
- [ ] Root Directory configurado como `backend`
- [ ] Build Command: `npm install && npm run build`
- [ ] Start Command: `npm start`
- [ ] PostgreSQL agregado
- [ ] Redis agregado (opcional)
- [ ] Variables de entorno configuradas
- [ ] JWT_SECRET generado y configurado
- [ ] URL del backend obtenida
- [ ] Health check funciona (`/health`)

---

## 🆘 TROUBLESHOOTING

### **Error: "Build failed"**
✅ Verifica que:
- Root Directory está como `backend`
- Build Command es correcto
- Todas las dependencias están en `backend/package.json`

### **Error: "Database connection failed"**
✅ Verifica que:
- PostgreSQL está agregado y corriendo
- `DATABASE_URL` está en las variables (auto-generada)

### **Error: "Cannot find module"**
✅ Verifica que:
- Build Command incluye `npm install`
- Todas las dependencias están en `package.json`

### **Error: "JWT_SECRET must be at least 32 characters"**
✅ Genera uno nuevo con el comando de arriba

---

## 📚 DOCUMENTACIÓN RELACIONADA

- `DEPLOYMENT_INMEDIATO.md` - Guía completa paso a paso
- `DEPLOYMENT_COMPLETO_PRODUCCION.md` - Guía detallada
- `GUIA_VARIABLES_ENTORNO.md` - Explicación de variables

---

## 🎯 PRÓXIMOS PASOS

Después de configurar Railway:
1. Configura Vercel (ver `DEPLOYMENT_VERCEL_ESPECIFICO.md`)
2. Actualiza `CORS_ORIGIN` en Railway con la URL de Vercel
3. Configura dominio personalizado

---

**¡Listo para deployment en Railway!** 🚀

