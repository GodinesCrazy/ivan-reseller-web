# 🚀 DEPLOYMENT COMPLETO - PROYECTO ESPECÍFICO

**Repositorio:** `GodinesCrazy/ivan-reseller-web`  
**URL Vercel:** https://vercel.com/ivan-martys-projects?repo=https://github.com/GodinesCrazy/ivan-reseller-web

---

## 📋 RESUMEN RÁPIDO

**Tiempo estimado:** 30-45 minutos  
**Dificultad:** Fácil (sigue los pasos)

---

## 🚂 PASO 1: RAILWAY (Backend) - 15 minutos

### **A. Crear Proyecto:**
1. Ve a: https://railway.app
2. Login con GitHub
3. **"New Project"** → **"Deploy from GitHub repo"**
4. Busca: `GodinesCrazy/ivan-reseller-web`
5. Selecciona el repositorio

### **B. Configurar:**
- **Root Directory:** `backend`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

### **C. Agregar PostgreSQL:**
- Click **"+ New"** → **"Database"** → **"PostgreSQL"**

### **D. Agregar Redis (Recomendado):**
- Click **"+ New"** → **"Database"** → **"Redis"**

### **E. Variables de Entorno:**
Click en servicio backend → **"Variables"** → Agregar:

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
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### **F. Obtener URL:**
- Railway → Settings → Networking → **"Generate Domain"**
- Copia la URL: `https://tu-backend-xxxx.up.railway.app`

**Ver guía detallada:** `DEPLOYMENT_RAILWAY_ESPECIFICO.md`

---

## ▲ PASO 2: VERCEL (Frontend) - 10 minutos

### **A. Importar Proyecto:**
1. Ve a: https://vercel.com/ivan-martys-projects?repo=https://github.com/GodinesCrazy/ivan-reseller-web
2. O ve a: https://vercel.com/new
3. Busca: `GodinesCrazy/ivan-reseller-web`
4. Click **"Import"**

### **B. Configurar:**
- **Framework Preset:** `Vite`
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

### **C. Variables de Entorno:**
En **"Environment Variables"**:

```env
VITE_API_URL=https://tu-backend-xxxx.up.railway.app
```

**Reemplaza** con la URL real de Railway.

### **D. Deploy:**
- Click **"Deploy"**
- Espera 2-3 minutos
- Vercel te dará: `https://ivan-reseller-web-xxxx.vercel.app`

**Ver guía detallada:** `DEPLOYMENT_VERCEL_ESPECIFICO.md`

---

## 🔄 PASO 3: ACTUALIZAR CORS - 2 minutos

1. Volver a Railway
2. Abrir servicio backend → **"Variables"**
3. Actualizar `CORS_ORIGIN`:

```env
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web-xxxx.vercel.app
```

4. Railway se redesplegará automáticamente

---

## 🌐 PASO 4: CONFIGURAR DOMINIO - 5 minutos

### **En Vercel:**
1. Dashboard → Tu Proyecto → **Settings** → **Domains**
2. Agregar: `ivanreseller.com` y `www.ivanreseller.com`
3. Vercel te dará records DNS

### **En tu Proveedor DNS:**
1. Ir a tu panel DNS
2. Agregar los records que Vercel te dio
3. Esperar 1-24 horas (propagación)

---

## ✅ VERIFICACIÓN

### **Backend:**
```
https://tu-backend.up.railway.app/health
```
Debería mostrar: `{"status":"ok"}`

### **Frontend:**
```
https://ivan-reseller-web-xxxx.vercel.app
```
Debería mostrar la página de login.

### **Login:**
- Usuario: `demo`
- Contraseña: `demo123`

---

## 📚 DOCUMENTACIÓN ADICIONAL

- `DEPLOYMENT_RAILWAY_ESPECIFICO.md` - Guía detallada Railway
- `DEPLOYMENT_VERCEL_ESPECIFICO.md` - Guía detallada Vercel
- `DEPLOYMENT_INMEDIATO.md` - Guía rápida general
- `GUIA_VARIABLES_ENTORNO.md` - Explicación de variables

---

## 🎯 CHECKLIST COMPLETO

### **Railway:**
- [ ] Proyecto creado
- [ ] Repositorio: `GodinesCrazy/ivan-reseller-web`
- [ ] Root Directory: `backend`
- [ ] PostgreSQL agregado
- [ ] Redis agregado
- [ ] Variables configuradas
- [ ] JWT_SECRET generado
- [ ] URL obtenida

### **Vercel:**
- [ ] Proyecto importado
- [ ] Repositorio: `GodinesCrazy/ivan-reseller-web`
- [ ] Root Directory: `frontend`
- [ ] Variables configuradas
- [ ] Deploy exitoso
- [ ] URL obtenida

### **Configuración:**
- [ ] CORS actualizado en Railway
- [ ] Dominio configurado en Vercel
- [ ] DNS configurado
- [ ] Verificación exitosa

---

**¡Listo para deployment!** 🚀

