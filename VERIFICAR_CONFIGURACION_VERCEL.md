# ✅ VERIFICAR CONFIGURACIÓN VERCEL - PASO A PASO

**Tu deployment está "Ready" ✅ Ahora verificamos la configuración.**

---

## 📋 PASO 1: VERIFICAR ROOT DIRECTORY

### **A. Ve a Settings:**

1. En la página donde estás, **click en la pestaña "Settings"** (arriba, junto a "Overview")
2. Busca la sección **"General"**
3. Busca el campo **"Root Directory"**

### **B. Verificar valor:**

**Debe decir:** `frontend`

**Si dice algo diferente o está vacío:**
- Cambia a: `frontend`
- Click **"Save"**

**✅ Verifica:** Root Directory = `frontend`

---

## 📋 PASO 2: VERIFICAR VARIABLE DE ENTORNO

### **A. En la misma página Settings:**

1. Busca la sección **"Environment Variables"**
2. O ve directamente: Settings → Environment Variables

### **B. Verificar VITE_API_URL:**

**Debe existir:**
```
VITE_API_URL = https://ivan-reseller-web-production.up.railway.app
```

**Si NO existe:**
1. Click **"Add New"** o **"Add Variable"**
2. **Name:** `VITE_API_URL`
3. **Value:** `https://ivan-reseller-web-production.up.railway.app`
4. **Environments:** Selecciona todas (Production, Preview, Development)
5. Click **"Save"**

**Si existe pero con valor diferente:**
1. Click en la variable
2. Actualiza el valor a: `https://ivan-reseller-web-production.up.railway.app`
3. Click **"Save"**

**✅ Verifica:** Variable `VITE_API_URL` existe y tiene el valor correcto.

---

## 📋 PASO 3: VERIFICAR BUILD SETTINGS

### **A. En Settings → Build & Development Settings:**

Verifica estos valores:

- **Framework Preset:** `Vite` (o `Other`)
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

**Si alguno es diferente, corrígelo y guarda.**

**✅ Verifica:** Todos los valores están correctos.

---

## 📋 PASO 4: PROBAR QUE FUNCIONA

### **A. Abrir la URL del frontend:**

1. En la página Overview, **click en el botón "Visit"** (negro, arriba a la derecha)
2. O abre directamente: `https://ivan-reseller-web.vercel.app`
3. Debería mostrar la página de login

### **B. Verificar en consola del navegador:**

1. Abre la consola del navegador (F12)
2. Ve a la pestaña **"Console"**
3. Verifica que NO haya errores de conexión al API
4. Ve a la pestaña **"Network"**
5. Intenta hacer login (aunque falle)
6. Verifica que las peticiones vayan a: `ivan-reseller-web-production.up.railway.app`

**✅ Verifica:** 
- La página carga correctamente
- No hay errores en la consola
- Las peticiones van al backend correcto

---

## 📋 PASO 5: ACTUALIZAR CORS EN RAILWAY

**Ahora que Vercel está funcionando, actualiza CORS:**

### **A. Ve a Railway:**

1. Abre: https://railway.app
2. Proyecto → Servicio `ivan-reseller-web` → **Variables**

### **B. Actualizar CORS_ORIGIN:**

1. Busca la variable `CORS_ORIGIN`
2. Click para editarla
3. Agrega la URL de Vercel:

**Valor actual:**
```
https://www.ivanreseller.com,https://ivanreseller.com
```

**Valor nuevo:**
```
https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
```

4. Click **"Save"**
5. Railway se redesplegará automáticamente

**✅ Verifica:** Railway debería comenzar un nuevo deployment.

---

## ✅ CHECKLIST FINAL

- [ ] Root Directory = `frontend` ✅
- [ ] Variable `VITE_API_URL` configurada ✅
- [ ] Build Settings correctos ✅
- [ ] Frontend carga correctamente ✅
- [ ] No hay errores en consola ✅
- [ ] Peticiones van al backend correcto ✅
- [ ] CORS actualizado en Railway ✅

---

## 🎉 SI TODO ESTÁ CORRECTO

**Tu sistema está funcionando:**
- ✅ Backend: `https://ivan-reseller-web-production.up.railway.app`
- ✅ Frontend: `https://ivan-reseller-web.vercel.app`
- ✅ Conexión: Frontend → Backend funcionando

**Próximo paso opcional:** Configurar dominio personalizado (`www.ivanreseller.com`)

---

**¡Sigue estos pasos y verifica que todo esté configurado correctamente!** 🚀

