# 🔧 SOLUCIÓN: ERROR DE BUILD EN RAILWAY

**Error:** `Failed to build an image` - Error en `npm install` con `prisma generate`

---

## 🚨 PROBLEMA IDENTIFICADO

El build está fallando porque:
1. Railway está intentando ejecutar `npm install` en la raíz del proyecto
2. Pero el proyecto tiene estructura `backend/` y `frontend/`
3. Prisma necesita el schema para generar el cliente

---

## ✅ SOLUCIÓN PASO A PASO

### **PASO 1: Configurar Root Directory en Railway**

1. Ve a Railway Dashboard → Tu proyecto
2. Click en el servicio **"ivan-reseller-web"**
3. Ve a **"Settings"** → **"Service"**
4. En **"Root Directory"** escribe: `backend`
5. Click **"Save"**

**Esto le dice a Railway que todo está en la carpeta `backend/`**

---

### **PASO 2: Configurar Build Commands**

En Railway Dashboard → Tu servicio → **"Settings"** → **"Build & Deploy"**:

**Build Command:**
```bash
npm install && npx prisma generate && npm run build
```

**Start Command:**
```bash
npm start
```

**O si prefieres usar el script de package.json:**
```bash
npm start
```
(El script `start` en package.json ya ejecuta `prisma migrate deploy`)

---

### **PASO 3: Verificar Variables de Entorno**

Railway Dashboard → Tu servicio → **"Variables"**:

**Variables OBLIGATORIAS:**
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=[genera uno con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"]
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
LOG_LEVEL=info
```

**Variables AUTO-GENERADAS (verificar que existan):**
- `DATABASE_URL` - Debe estar automáticamente (de PostgreSQL)
- `REDIS_URL` - Si agregaste Redis

---

### **PASO 4: Redesplegar**

1. Railway Dashboard → Tu servicio
2. Click en **"Deployments"**
3. Click en el deployment más reciente (el que falló)
4. Click en **"Redeploy"** (o el botón de re-deploy)

**O simplemente:**
- Haz un push nuevo a GitHub
- Railway redesplegará automáticamente

---

## 🔍 VERIFICACIÓN ADICIONAL

### **Si el error persiste, verifica:**

1. **Prisma Schema existe:**
   - Debe existir: `backend/prisma/schema.prisma`

2. **Package.json tiene postinstall:**
   - Debe tener: `"postinstall": "prisma generate"`

3. **Node version:**
   - Railway debería usar Node 20+ automáticamente
   - Si no, agrega variable: `NODE_VERSION=20`

---

## 📋 CONFIGURACIÓN COMPLETA DE RAILWAY

### **Settings → Service:**
- **Root Directory:** `backend`
- **Service Name:** `ivan-reseller-web` (o como prefieras)

### **Settings → Build & Deploy:**
- **Build Command:** `npm install && npx prisma generate && npm run build`
- **Start Command:** `npm start`

### **Settings → Variables:**
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=[tu_secret_aqui]
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
LOG_LEVEL=info
```

---

## 🆘 SI AÚN FALLA

### **Opción A: Usar Railway CLI**

```bash
cd backend
railway link
railway variables set NODE_ENV=production
railway variables set JWT_SECRET=[tu_secret]
railway up
```

### **Opción B: Verificar Logs Detallados**

1. Railway Dashboard → Tu servicio → **"Deployments"**
2. Click en el deployment que falló
3. Click en **"View Logs"**
4. Busca el error específico
5. Comparte el error completo y te ayudo a solucionarlo

---

## ✅ CHECKLIST DE SOLUCIÓN

- [ ] Root Directory configurado como `backend`
- [ ] Build Command incluye `prisma generate`
- [ ] Variables de entorno configuradas
- [ ] JWT_SECRET generado y configurado
- [ ] DATABASE_URL existe (auto-generada)
- [ ] Redesplegado después de cambios

---

**Después de aplicar estos cambios, el deployment debería funcionar.** 🚀

