# 🔧 SOLUCIÓN COMPLETA - ERROR DE LOGIN

**Problema:** "Internal Server Error" o "Route not found" al hacer login con `admin` / `admin123`

---

## 🎯 PASO 1: VERIFICAR VARIABLE VITE_API_URL EN VERCEL (CRÍTICO)

### **A. Ve a Vercel:**

1. Vercel Dashboard → Tu proyecto `ivan-reseller-web`
2. **Settings** → **Environment Variables**

### **B. Verificar/Agregar:**

**Debe existir:**
```
VITE_API_URL = https://ivan-reseller-web-production.up.railway.app
```

**Si NO existe:**
1. Click **"Add New"**
2. **Name:** `VITE_API_URL`
3. **Value:** `https://ivan-reseller-web-production.up.railway.app`
4. **Environments:** Todas (Production, Preview, Development)
5. Click **"Save"**
6. **Haz un redeploy** (esto es crítico - las variables no se aplican sin redeploy)

---

## 🎯 PASO 2: CREAR USUARIO ADMIN EN RAILWAY

El seed debería haberse ejecutado automáticamente, pero puede que no se haya ejecutado.

### **Opción A: Desde Railway Dashboard**

1. Railway Dashboard → Tu servicio `ivan-reseller-web`
2. Click en **"Deployments"**
3. Click en el deployment más reciente
4. Busca un botón de **"Console"** o **"Terminal"**
5. Ejecuta:

```bash
npx tsx prisma/seed.ts
```

### **Opción B: Usar Railway CLI**

```powershell
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Conectar al proyecto
railway link

# Ejecutar seed
railway run npx tsx prisma/seed.ts
```

---

## 🎯 PASO 3: ACTUALIZAR CORS EN RAILWAY

1. Railway Dashboard → Variables
2. Busca `CORS_ORIGIN`
3. Actualiza a:

```
https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
```

4. Guarda
5. Railway se redesplegará automáticamente

---

## ✅ VERIFICACIÓN

### **1. Probar Health Check:**
```
https://ivan-reseller-web-production.up.railway.app/health
```
Debería mostrar: `{"status":"ok"}`

### **2. Probar Login API directamente:**
Abre en tu navegador (o usa curl):
```
https://ivan-reseller-web-production.up.railway.app/api/auth/login
```
Debería mostrar un error de método (POST required), NO "Route not found"

### **3. Verificar en consola del navegador:**
1. Abre: `https://ivan-reseller-web.vercel.app`
2. Abre consola (F12)
3. Ve a **Network**
4. Intenta hacer login
5. Verifica que la petición vaya a: `ivan-reseller-web-production.up.railway.app/api/auth/login`
6. Verifica el error específico en la respuesta

---

## 🆘 SI AÚN FALLA

### **Ver logs de Railway:**

1. Railway Dashboard → Tu servicio → **Logs**
2. Busca errores relacionados con:
   - Base de datos
   - Autenticación
   - CORS

### **Verificar que el usuario admin existe:**

Si tienes acceso a Prisma Studio o a la base de datos directamente, verifica que existe un usuario con:
- username: `admin`
- email: `admin@ivanreseller.com`

---

**¡Sigue estos pasos y el login debería funcionar!** 🚀

