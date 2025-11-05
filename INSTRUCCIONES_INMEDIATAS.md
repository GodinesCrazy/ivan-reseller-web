# ⚡ INSTRUCCIONES INMEDIATAS - SOLUCIONAR ERROR RAILWAY

**Tu proyecto está desactualizado en Railway. Necesitas actualizar la configuración.**

---

## 🚨 PROBLEMA IDENTIFICADO

Railway está intentando construir desde la **raíz del proyecto**, pero tu código está en la carpeta **`backend/`**.

**Error:** `Failed to build an image` → `npm install` → `prisma generate` falla

---

## ✅ SOLUCIÓN INMEDIATA (5 MINUTOS)

### **1. Configurar Root Directory en Railway:**

1. Ve a Railway Dashboard: https://railway.app
2. Click en tu proyecto **"ivan-reseller"**
3. Click en el servicio **"ivan-reseller-web"** (el que está fallando)
4. Click en **"Settings"** (⚙️ engranaje)
5. Busca **"Root Directory"**
6. Cambia de: (vacío) → a: `backend`
7. Click **"Save"**

---

### **2. Configurar Build Commands:**

En la misma página **"Settings"** → **"Build & Deploy"**:

**Build Command:**
```
npm install && npx prisma generate && npm run build
```

**Start Command:**
```
npm start
```

Click **"Save"**

---

### **3. Verificar Variables:**

Railway Dashboard → Tu servicio → **"Variables"**

**Debes tener:**
- `NODE_ENV=production`
- `PORT=3000`
- `JWT_SECRET=[32+ caracteres]`
- `DATABASE_URL` (auto-generada ✅)

**Si falta `JWT_SECRET`, genera uno:**
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### **4. Redesplegar:**

Railway Dashboard → **"Deployments"** → Click en el deployment fallido → **"Redeploy"**

**O simplemente:**
- Haz un push nuevo a GitHub
- Railway se redesplegará automáticamente

---

## 📚 DOCUMENTACIÓN COMPLETA

- **Guía Visual:** `GUIA_VISUAL_RAILWAY.md`
- **Configuración Exacta:** `CONFIGURACION_RAILWAY_EXACTA.md`
- **Solución Completa:** `SOLUCION_RAILWAY_COMPLETA.md`

---

## ✅ VERIFICACIÓN

Después del redeploy:
1. Espera 2-3 minutos
2. Debe aparecer **"Deployment successful"** (verde)
3. Prueba: `https://tu-backend.up.railway.app/health`
4. Debe mostrar: `{"status":"ok"}`

---

**¡Sigue estos 4 pasos y el deployment debería funcionar!** 🚀

