# 🔧 ACTUALIZAR PROYECTO EXISTENTE EN VERCEL

**Tu proyecto ya está en Vercel, pero necesita actualizar la configuración.**

---

## 🎯 PASO 1: ABRIR LA CONFIGURACIÓN DEL PROYECTO

1. En Vercel Dashboard, **click en el proyecto** `ivan-reseller-web`
2. O click en el icono de **tres puntos** (⋯) → **"Settings"**

**✅ Verifica:** Deberías estar en la página de Settings del proyecto.

---

## 🎯 PASO 2: CONFIGURAR ROOT DIRECTORY

### **A. Ve a Settings → General:**

1. Busca la sección **"General"**
2. Busca el campo **"Root Directory"**

### **B. Configurar Root Directory:**

1. **Si está vacío o dice `./` o `/`:**
   - Click en el campo
   - Escribe: `frontend`
   - Click **"Save"**

2. **Si ya tiene un valor diferente:**
   - Cambia a: `frontend`
   - Click **"Save"**

**✅ Verifica:** Root Directory debe decir: `frontend`

---

## 🎯 PASO 3: VERIFICAR BUILD SETTINGS

### **A. Ve a Settings → Build & Development Settings:**

1. Busca la sección **"Build & Development Settings"**
2. Verifica estos valores:

### **B. Framework Preset:**
- Debe ser: `Vite` (o `Other` si no aparece Vite)

### **C. Build Command:**
- Debe ser: `npm run build`
- Si es diferente, cámbialo

### **D. Output Directory:**
- Debe ser: `dist`
- Si es diferente, cámbialo

### **E. Install Command:**
- Debe ser: `npm install`
- Si es diferente, cámbialo

**✅ Verifica:** Todos estos valores deben estar correctos.

---

## 🎯 PASO 4: CONFIGURAR VARIABLE DE ENTORNO

### **A. Ve a Settings → Environment Variables:**

1. Busca la sección **"Environment Variables"**
2. Verifica si existe `VITE_API_URL`

### **B. Si NO existe:**

1. Click en **"Add New"** o **"Add Variable"**
2. **Variable Name:** `VITE_API_URL`
3. **Value:** `https://ivan-reseller-web-production.up.railway.app`
4. **Environment:** Selecciona todas:
   - ✅ Production
   - ✅ Preview
   - ✅ Development
5. Click **"Save"**

### **C. Si YA existe:**

1. Click en la variable `VITE_API_URL`
2. Verifica que el valor sea: `https://ivan-reseller-web-production.up.railway.app`
3. Si es diferente, actualízalo
4. Click **"Save"**

**✅ Verifica:** Debe aparecer:
```
VITE_API_URL = https://ivan-reseller-web-production.up.railway.app
```

---

## 🎯 PASO 5: REDESPLEGAR

### **A. Opción 1: Desde Deployments**

1. Ve a la pestaña **"Deployments"** (arriba)
2. Busca el deployment más reciente
3. Click en los **tres puntos** (⋯) del deployment
4. Selecciona **"Redeploy"**
5. Confirma el redeploy

### **B. Opción 2: Hacer un nuevo commit**

Si prefieres, haz un commit vacío para forzar un nuevo deploy:

```bash
git commit --allow-empty -m "chore: Trigger Vercel redeploy"
git push origin main
```

### **C. Opción 3: Desde el Dashboard**

1. Ve a la página principal del proyecto
2. Click en **"Redeploy"** (si está disponible)

**✅ Verifica:** Deberías ver un nuevo deployment en proceso.

---

## 🎯 PASO 6: VERIFICAR EL DEPLOYMENT

### **A. Esperar (2-5 minutos):**

- Vercel construirá el proyecto
- Verás el progreso en tiempo real

### **B. Verificar que sea exitoso:**

1. Ve a **"Deployments"**
2. El deployment más reciente debe tener:
   - ✅ Checkmark verde
   - ✅ "Ready" status
   - NO debe tener ❌ (error) o ⚠️ (warning)

### **C. Verificar la URL:**

1. Click en el deployment exitoso
2. O ve a la URL: `https://ivan-reseller-web.vercel.app`
3. Debería mostrar la página de login

**✅ Verifica:** El deployment debe ser exitoso y la página debe cargar.

---

## 🎯 PASO 7: ACTUALIZAR CORS EN RAILWAY

**Después de que Vercel funcione:**

1. Ve a Railway: https://railway.app
2. Proyecto → Servicio `ivan-reseller-web` → **Variables**
3. Busca `CORS_ORIGIN`
4. Actualiza a:

```
https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
```

5. Railway se redesplegará automáticamente

---

## 🆘 SI EL DEPLOYMENT FALLA

### **Error: "Build failed"**

**Causa:** Root Directory no está configurado correctamente

**Solución:**
1. Verifica que Root Directory sea `frontend`
2. Verifica que Build Command sea `npm run build`
3. Verifica que Output Directory sea `dist`

### **Error: "Cannot find module"**

**Causa:** Instalando dependencias desde la raíz en lugar de `frontend/`

**Solución:**
1. Asegúrate de que Root Directory sea `frontend`
2. Redesplega

### **Error: "404 on routes"**

**Causa:** Configuración de routing incorrecta

**Solución:**
1. Verifica que `vercel.json` existe en la raíz
2. Si no existe, créalo (ya está en tu proyecto)

---

## ✅ CHECKLIST DE ACTUALIZACIÓN

- [ ] Root Directory configurado como `frontend`
- [ ] Build Command: `npm run build`
- [ ] Output Directory: `dist`
- [ ] Variable `VITE_API_URL` configurada con URL de Railway
- [ ] Redeploy realizado
- [ ] Deployment exitoso (verde ✅)
- [ ] Página carga correctamente
- [ ] CORS actualizado en Railway

---

**¡Sigue estos pasos para actualizar tu proyecto existente en Vercel!** 🚀

