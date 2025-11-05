# 🚂 GUÍA VISUAL - SOLUCIONAR ERROR EN RAILWAY

**Problema:** Build fallando porque Railway no encuentra el código en `backend/`

---

## ✅ SOLUCIÓN PASO A PASO (5 MINUTOS)

### **PASO 1: Configurar Root Directory**

1. **En Railway Dashboard:**
   - Ve a tu proyecto **"ivan-reseller"**
   - Click en el servicio **"ivan-reseller-web"** (el que está fallando)

2. **Configurar Root Directory:**
   - Click en **"Settings"** (icono de engranaje ⚙️)
   - Busca la sección **"Service"**
   - En **"Root Directory"** escribe: `backend`
   - Click **"Save"**

   **IMPORTANTE:** Esto le dice a Railway que el código está en la carpeta `backend/`, no en la raíz.

---

### **PASO 2: Configurar Build Commands**

En la misma página de **"Settings"** → **"Build & Deploy"**:

**Build Command:**
```bash
npm install && npx prisma generate && npm run build
```

**Start Command:**
```bash
npm start
```

Click **"Save"**

---

### **PASO 3: Verificar Variables de Entorno**

1. Railway Dashboard → Tu servicio → **"Variables"**
2. Verifica que tengas estas variables:

**OBLIGATORIAS:**
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=[debe tener 32+ caracteres]
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
LOG_LEVEL=info
```

**AUTO-GENERADAS (deben existir automáticamente):**
- `DATABASE_URL` - De PostgreSQL (ya está conectado ✅)

**Si falta `JWT_SECRET`:**
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copia el resultado y agrégalo en Railway → Variables → Add Variable

---

### **PASO 4: Redesplegar**

**Opción A: Desde Railway Dashboard**
1. Ve a **"Deployments"**
2. Click en el deployment que falló
3. Click en **"Redeploy"** (botón en la esquina superior derecha)

**Opción B: Push a GitHub**
- Haz un commit y push a GitHub
- Railway detectará el cambio y redesplegará automáticamente

---

## 📋 RESUMEN DE CONFIGURACIÓN

### **Settings → Service:**
```
Root Directory: backend
```

### **Settings → Build & Deploy:**
```
Build Command: npm install && npx prisma generate && npm run build
Start Command: npm start
```

### **Settings → Variables:**
```
NODE_ENV=production
PORT=3000
JWT_SECRET=[tu_secret_32_caracteres]
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
LOG_LEVEL=info
```

---

## ✅ VERIFICACIÓN

Después del redeploy:

1. **Espera 2-3 minutos** para que Railway termine el build
2. **Verifica que el deployment sea exitoso** (debe aparecer en verde)
3. **Prueba el health check:**
   - Abre: `https://ivan-reseller-web-production.up.railway.app/health`
   - Debe mostrar: `{"status":"ok"}`

---

## 🆘 SI AÚN FALLA

### **Ver Logs Detallados:**

1. Railway Dashboard → Tu servicio → **"Deployments"**
2. Click en el deployment que falló
3. Scroll hacia abajo hasta **"Build Logs"**
4. Copia el error completo
5. Compártelo y te ayudo a solucionarlo

---

**Después de aplicar estos cambios, el deployment debería funcionar.** 🚀

**¿Puedes seguir estos pasos y decirme si funciona? Si sigue fallando, comparte los logs completos del error.**

