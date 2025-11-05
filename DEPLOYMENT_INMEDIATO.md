# 🚀 DEPLOYMENT INMEDIATO - www.ivanreseller.com

**Guía rápida para subir a producción AHORA (15-30 minutos)**

---

## 📝 ¿QUÉ SON LAS VARIABLES DE ENTORNO?

**Explicación simple:**
Son configuraciones que el sistema necesita. Son como "ajustes" que cambian según dónde esté corriendo (tu computadora vs servidor).

**Ejemplo:**
```
En tu PC: DATABASE_URL = "file:./dev.db" (local)
En producción: DATABASE_URL = "postgresql://..." (remota)
```

**¿Dónde las configuro?**
- **Railway (Backend):** Dashboard → Tu servicio → "Variables"
- **Vercel (Frontend):** Dashboard → Tu proyecto → Settings → Environment Variables

**Ver detalles completos:** `GUIA_VARIABLES_ENTORNO.md`

---

## ⚡ PASOS RÁPIDOS (15-30 minutos)

### **PASO 1: Preparar Código (2 minutos)**

```bash
# Verificar que todo está commiteado
git status

# Si hay cambios, commitearlos
git add .
git commit -m "feat: Sistema completo listo para producción"
git push origin main
```

---

### **PASO 2: Railway - Backend (10 minutos)**

#### **A. Crear Proyecto:**
1. Ir a: https://railway.app
2. Login con GitHub
3. **"New Project"** → **"Deploy from GitHub repo"**
4. Seleccionar tu repositorio

#### **B. Configurar:**
- **Root Directory:** `backend`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

#### **C. Agregar PostgreSQL:**
- Click **"+ New"** → **"Database"** → **"PostgreSQL"**
- Railway crea automáticamente `DATABASE_URL`

#### **D. Agregar Redis (Recomendado):**
- Click **"+ New"** → **"Database"** → **"Redis"**
- Railway crea automáticamente `REDIS_URL`

#### **E. Variables de Entorno:**
Click en servicio backend → **"Variables"** → Agregar estas:

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=[GENERA UNO - VER ABAJO]
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
LOG_LEVEL=info
```

**Generar JWT_SECRET:**
```bash
# En tu terminal (PowerShell):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Copia el resultado y pégalo como valor de `JWT_SECRET`**

#### **F. Obtener URL:**
- Railway → Settings → Networking → **"Generate Domain"**
- Copia la URL: `https://tu-backend-xxxx.up.railway.app`

---

### **PASO 3: Vercel - Frontend (5 minutos)**

#### **A. Crear Proyecto:**
1. Ir a: https://vercel.com
2. Login con GitHub
3. **"Add New..."** → **"Project"**
4. Importar tu repositorio

#### **B. Configurar:**
- **Framework Preset:** Vite
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

#### **C. Variables de Entorno:**
En **"Environment Variables"**:

```env
VITE_API_URL=https://tu-backend-xxxx.up.railway.app
```

**Reemplaza** `tu-backend-xxxx.up.railway.app` con la URL real de Railway.

#### **D. Deploy:**
- Click **"Deploy"**
- Espera 2-3 minutos
- Vercel te dará: `https://ivan-reseller-xxxx.vercel.app`

---

### **PASO 4: Actualizar CORS (2 minutos)**

1. Volver a Railway
2. Abrir servicio backend
3. **"Variables"**
4. Actualizar `CORS_ORIGIN`:

```env
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-xxxx.vercel.app
```

5. Railway redesployará automáticamente

---

### **PASO 5: Configurar Dominio (5-10 minutos)**

#### **En Vercel:**
1. Dashboard → Tu Proyecto → **Settings** → **Domains**
2. Agregar: `ivanreseller.com` y `www.ivanreseller.com`
3. Vercel te dará records DNS

#### **En tu Proveedor DNS:**
1. Ir a tu panel de DNS (Namecheap, GoDaddy, etc.)
2. Agregar los records que Vercel te dio
3. Esperar 1-24 horas (propagación)

**Mientras tanto, puedes usar la URL de Vercel:** `https://ivan-reseller-xxxx.vercel.app`

---

## ✅ VERIFICACIÓN RÁPIDA

### **1. Backend:**
Abrir: `https://tu-backend-xxxx.up.railway.app/health`
Debería mostrar: `{"status":"ok"}`

### **2. Frontend:**
Abrir: `https://ivan-reseller-xxxx.vercel.app`
Debería mostrar la página de login

### **3. Login:**
- Usuario: `demo` (o el que creaste en seed)
- Contraseña: `demo123` (o la que configuraste)

---

## 📋 RESUMEN DE VARIABLES DE ENTORNO

### **Backend (Railway) - OBLIGATORIAS:**
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=[genera con comando arriba]
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
```

**Auto-generadas por Railway:**
- `DATABASE_URL` (al agregar PostgreSQL)
- `REDIS_URL` (al agregar Redis)

### **Frontend (Vercel) - OBLIGATORIAS:**
```env
VITE_API_URL=https://tu-backend-xxxx.up.railway.app
```

---

## 🚨 PROBLEMAS COMUNES Y SOLUCIONES

### **"Cannot connect to API"**
✅ Verificar que `VITE_API_URL` en Vercel sea correcta

### **"CORS policy blocked"**
✅ Agregar tu dominio exacto a `CORS_ORIGIN` en Railway

### **"Database connection failed"**
✅ Verificar que PostgreSQL esté running en Railway

### **"JWT_SECRET must be at least 32 characters"**
✅ Generar uno nuevo con el comando de arriba

---

## 🎯 VARIABLES OPCIONALES (pero Recomendadas)

### **Para Pagos Automáticos PayPal:**
```env
PAYPAL_CLIENT_ID=tu_client_id
PAYPAL_CLIENT_SECRET=tu_client_secret
PAYPAL_ENVIRONMENT=production
```

**Obtener en:** https://developer.paypal.com/

---

## ✅ TODO LISTO

**Tu sistema está 100% listo para producción.** Solo sigue los pasos arriba y en 15-30 minutos tendrás tu sitio en vivo.

**URLs finales:**
- Frontend: https://www.ivanreseller.com
- Backend: https://api.ivanreseller.com (o la URL de Railway)

🎉 **¡Éxito con el deployment!**

---

**¿Necesitas más detalles?** Revisa `DEPLOYMENT_COMPLETO_PRODUCCION.md` para guía detallada.
