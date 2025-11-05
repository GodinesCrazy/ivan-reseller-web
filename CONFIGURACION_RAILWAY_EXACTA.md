# ⚙️ CONFIGURACIÓN EXACTA PARA RAILWAY

**Pasos exactos para configurar Railway con tu proyecto `GodinesCrazy/ivan-reseller-web`**

---

## 🎯 PASO 1: ROOT DIRECTORY (CRÍTICO)

### **En Railway Dashboard:**

1. Ve a: https://railway.app
2. Click en tu proyecto **"ivan-reseller"**
3. Click en el servicio **"ivan-reseller-web"**
4. Click en **"Settings"** (⚙️ icono de engranaje)
5. Busca la sección **"Service"**
6. En el campo **"Root Directory"** escribe exactamente:
   ```
   backend
   ```
7. Click **"Save"** (botón azul)

**✅ Esto es lo MÁS IMPORTANTE - sin esto, Railway buscará el código en la raíz y fallará.**

---

## 🎯 PASO 2: BUILD COMMANDS

En la misma página de **"Settings"** → **"Build & Deploy"**:

### **Build Command:**
Escribe exactamente:
```bash
npm install && npx prisma generate && npm run build
```

### **Start Command:**
Escribe exactamente:
```bash
npm start
```

Click **"Save"**

---

## 🎯 PASO 3: VARIABLES DE ENTORNO

Railway Dashboard → Tu servicio → **"Variables"** → **"Add Variable"**

Agrega estas variables **UNA POR UNA**:

### **Variable 1:**
```
Name: NODE_ENV
Value: production
```

### **Variable 2:**
```
Name: PORT
Value: 3000
```

### **Variable 3:**
```
Name: JWT_SECRET
Value: [GENERA UNO - VER ABAJO]
```

**Generar JWT_SECRET:**
Abre PowerShell y ejecuta:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copia el resultado (debe ser una cadena de 64 caracteres) y úsalo como valor.

### **Variable 4:**
```
Name: JWT_EXPIRES_IN
Value: 7d
```

### **Variable 5:**
```
Name: CORS_ORIGIN
Value: https://www.ivanreseller.com,https://ivanreseller.com
```

### **Variable 6:**
```
Name: LOG_LEVEL
Value: info
```

**✅ Variables Auto-Generadas (NO agregar manualmente):**
- `DATABASE_URL` - Se crea automáticamente cuando agregas PostgreSQL (ya lo tienes ✅)

---

## 🎯 PASO 4: REDESPLEGAR

### **Opción A: Desde Railway Dashboard**

1. Railway Dashboard → Tu servicio → **"Deployments"**
2. Click en el deployment más reciente (el que falló)
3. En la esquina superior derecha, click en **"Redeploy"**
4. Confirma el redeploy

### **Opción B: Push a GitHub**

Si prefieres, haz un push nuevo a GitHub y Railway se redesplegará automáticamente:

```bash
git add .
git commit -m "fix: Configurar Railway para deployment"
git push origin main
```

---

## ✅ VERIFICACIÓN

1. **Espera 2-5 minutos** para que Railway termine el build
2. **Verifica el estado:**
   - Railway Dashboard → Deployments
   - Debe aparecer **"Deployment successful"** (verde)
3. **Prueba el health check:**
   - Abre: `https://ivan-reseller-web-production.up.railway.app/health`
   - Debe mostrar: `{"status":"ok"}`

---

## 📋 CHECKLIST COMPLETO

- [ ] Root Directory configurado como `backend`
- [ ] Build Command: `npm install && npx prisma generate && npm run build`
- [ ] Start Command: `npm start`
- [ ] Variable `NODE_ENV=production` agregada
- [ ] Variable `PORT=3000` agregada
- [ ] Variable `JWT_SECRET` generada y agregada (32+ caracteres)
- [ ] Variable `JWT_EXPIRES_IN=7d` agregada
- [ ] Variable `CORS_ORIGIN` agregada
- [ ] Variable `LOG_LEVEL=info` agregada
- [ ] `DATABASE_URL` existe (auto-generada de PostgreSQL)
- [ ] Redesplegado después de cambios
- [ ] Health check funciona (`/health`)

---

## 🆘 SI AÚN FALLA

### **Ver Logs Completos:**

1. Railway Dashboard → Tu servicio → **"Deployments"**
2. Click en el deployment que falló
3. Scroll hacia abajo hasta **"Build Logs"**
4. Copia TODO el error (desde el inicio hasta el final)
5. Compártelo y te ayudo a solucionarlo específicamente

### **Verificar que los archivos existen:**

Asegúrate de que estos archivos están en tu repositorio GitHub:
- ✅ `backend/package.json`
- ✅ `backend/prisma/schema.prisma`
- ✅ `backend/src/server.ts`
- ✅ `backend/tsconfig.json`

---

**Después de aplicar estos cambios EXACTOS, el deployment debería funcionar.** 🚀

**¿Puedes seguir estos pasos y decirme si funciona? Si sigue fallando, comparte los logs completos del error.**

