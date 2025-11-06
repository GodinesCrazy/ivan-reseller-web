# 🔧 SOLUCIÓN: ERROR DE LOGIN

**Error:** "Internal Server Error" o "Route not found" al intentar hacer login.

---

## 🎯 PROBLEMA 1: VARIABLE VITE_API_URL NO CONFIGURADA

### **Verificar en Vercel:**

1. Vercel Dashboard → Tu proyecto → **Settings** → **Environment Variables**
2. Verifica que exista `VITE_API_URL`
3. Debe tener el valor: `https://ivan-reseller-web-production.up.railway.app`
4. **Si NO existe, agrégala:**
   - Name: `VITE_API_URL`
   - Value: `https://ivan-reseller-web-production.up.railway.app`
   - Environments: Todas (Production, Preview, Development)
   - Click **"Save"**
   - **Haz un redeploy** después de agregarla

---

## 🎯 PROBLEMA 2: USUARIO ADMIN NO EXISTE EN LA BASE DE DATOS

El seed debería haberse ejecutado automáticamente, pero puede que no se haya ejecutado en Railway.

### **Solución: Ejecutar seed manualmente en Railway**

1. Railway Dashboard → Tu servicio `ivan-reseller-web`
2. Click en **"Deployments"**
3. Click en el deployment más reciente
4. Click en **"View Logs"** o abre la consola
5. O ve a **"Settings"** → **"Deployments"** → **"Deploy Hooks"**
6. Ejecuta manualmente:

```bash
npx tsx prisma/seed.ts
```

O desde Railway CLI:

```bash
railway run npx tsx prisma/seed.ts
```

---

## 🎯 PROBLEMA 3: CORS NO CONFIGURADO

### **Actualizar CORS en Railway:**

1. Railway Dashboard → Variables
2. Busca `CORS_ORIGIN`
3. Actualiza a:

```
https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
```

4. Railway se redesplegará automáticamente

---

## ✅ VERIFICACIÓN PASO A PASO

### **1. Verificar Variable en Vercel:**
- ✅ `VITE_API_URL` existe
- ✅ Valor: `https://ivan-reseller-web-production.up.railway.app`

### **2. Verificar Usuario Admin:**
- Ejecutar seed en Railway
- O desde tu PC (si tienes acceso a la BD):

```bash
cd backend
npx tsx prisma/seed.ts
```

### **3. Verificar CORS:**
- ✅ `CORS_ORIGIN` incluye la URL de Vercel

### **4. Probar Login:**
- Usuario: `admin`
- Contraseña: `admin123`

---

**¡Sigue estos pasos y el login debería funcionar!** 🚀

