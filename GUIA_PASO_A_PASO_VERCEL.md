# ▲ GUÍA PASO A PASO - CONFIGURAR VERCEL

**Proyecto:** `GodinesCrazy/ivan-reseller-web`  
**Backend URL:** `https://ivan-reseller-web-production.up.railway.app`

---

## 📋 PASO 1: ACCEDER A VERCEL

### **A. Abre tu navegador y ve a:**

```
https://vercel.com/ivan-martys-projects
```

O simplemente:
```
https://vercel.com/new
```

### **B. Asegúrate de estar logueado:**

- Si no estás logueado, haz login con GitHub
- Debe ser la misma cuenta que tiene acceso a `GodinesCrazy/ivan-reseller-web`

**✅ Verifica:** Deberías ver tu dashboard de Vercel con tus proyectos.

---

## 📋 PASO 2: IMPORTAR PROYECTO

### **A. Click en "Add New..." → "Project"**

O si estás en la página principal:
- Click en **"Add New..."** (botón en la esquina superior derecha)
- Selecciona **"Project"**

### **B. Buscar tu repositorio:**

1. En la lista de repositorios, busca: **`ivan-reseller-web`**
2. O busca: **`GodinesCrazy/ivan-reseller-web`**
3. Debería aparecer con el icono de GitHub

### **C. Click en "Import"**

**✅ Verifica:** Deberías ver la página de configuración del proyecto.

---

## 📋 PASO 3: CONFIGURAR EL PROYECTO

### **A. Framework Preset:**

- **Vercel debería detectar automáticamente:** `Vite`
- Si no, selecciona manualmente: **"Vite"**

### **B. Root Directory (CRÍTICO):**

1. Busca el campo **"Root Directory"**
2. **Cambia de:** (vacío o `./`) 
3. **A:** `frontend`
4. **IMPORTANTE:** Esto le dice a Vercel que el código del frontend está en la carpeta `frontend/`

**✅ Verifica:** Root Directory debe decir: `frontend`

### **C. Build Command:**

1. Busca el campo **"Build Command"**
2. Debe decir: `npm run build`
3. Si no, escríbelo manualmente

**✅ Verifica:** Build Command debe ser: `npm run build`

### **D. Output Directory:**

1. Busca el campo **"Output Directory"**
2. Debe decir: `dist`
3. Si no, escríbelo manualmente

**✅ Verifica:** Output Directory debe ser: `dist`

### **E. Install Command:**

1. Busca el campo **"Install Command"**
2. Debe decir: `npm install`
3. Si no, escríbelo manualmente

**✅ Verifica:** Install Command debe ser: `npm install`

---

## 📋 PASO 4: CONFIGURAR VARIABLES DE ENTORNO

**ANTES de hacer click en "Deploy":**

### **A. Busca la sección "Environment Variables"**

- Puede estar en la misma página de configuración
- O puede estar en una sección expandible
- Click en **"Environment Variables"** o **"Add Environment Variable"**

### **B. Agregar Variable:**

1. **Variable Name:** `VITE_API_URL`
2. **Value:** `https://ivan-reseller-web-production.up.railway.app`
3. **Environment:** Selecciona todas (Production, Preview, Development)
4. Click **"Add"** o **"Save"**

**✅ Verifica:** Debe aparecer en la lista:
```
VITE_API_URL = https://ivan-reseller-web-production.up.railway.app
```

**IMPORTANTE:** 
- No agregues `http://` o `https://` al final
- No agregues `/api` al final
- Debe ser exactamente la URL de Railway que tienes

---

## 📋 PASO 5: DEPLOY

### **A. Revisar configuración:**

Antes de hacer deploy, verifica:
- ✅ Framework: `Vite`
- ✅ Root Directory: `frontend`
- ✅ Build Command: `npm run build`
- ✅ Output Directory: `dist`
- ✅ Variable `VITE_API_URL` configurada

### **B. Click en "Deploy"**

1. Click en el botón **"Deploy"** (grande, azul, en la parte inferior)
2. Vercel comenzará a construir el proyecto
3. Verás un progreso en tiempo real

### **C. Esperar (2-5 minutos):**

- Vercel instalará dependencias
- Compilará el proyecto
- Desplegará el frontend
- Te dará una URL cuando termine

**✅ Verifica:** Deberías ver un progreso como:
- "Installing dependencies..."
- "Building..."
- "Deploying..."

---

## 📋 PASO 6: OBTENER URL Y VERIFICAR

### **A. Cuando termine el deploy:**

1. Vercel te mostrará una URL como:
   ```
   https://ivan-reseller-web-xxxx.vercel.app
   ```
2. **COPIA esta URL** - La necesitarás para actualizar CORS

### **B. Verificar que funciona:**

1. Abre la URL en tu navegador
2. Debería mostrar la página de login
3. Si ves un error, revisa la consola del navegador (F12)

**✅ Verifica:** Deberías ver la página de login de tu aplicación.

---

## 📋 PASO 7: ACTUALIZAR CORS EN RAILWAY

**Ahora que tienes la URL de Vercel:**

### **A. Ve a Railway:**

1. Abre: https://railway.app
2. Ve a tu proyecto **"ivan-reseller"**
3. Click en el servicio **"ivan-reseller-web"**
4. Ve a **"Variables"**

### **B. Actualizar CORS_ORIGIN:**

1. Busca la variable `CORS_ORIGIN`
2. Click en ella para editarla
3. Agrega la URL de Vercel al final:

**Valor actual:**
```
https://www.ivanreseller.com,https://ivanreseller.com
```

**Valor nuevo (reemplaza con tu URL real de Vercel):**
```
https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web-xxxx.vercel.app
```

4. Click **"Save"**
5. Railway se redesplegará automáticamente

**✅ Verifica:** Railway debería comenzar un nuevo deployment automáticamente.

---

## 📋 PASO 8: VERIFICACIÓN FINAL

### **A. Probar Backend:**

Abre en tu navegador:
```
https://ivan-reseller-web-production.up.railway.app/health
```

**Debería mostrar:**
```json
{"status":"ok","timestamp":"...","environment":"production"}
```

### **B. Probar Frontend:**

Abre la URL de Vercel que obtuviste.

**Debería mostrar:**
- La página de login
- Sin errores en la consola (F12)

### **C. Probar Conexión:**

1. Abre la consola del navegador (F12)
2. Ve a la pestaña **"Network"**
3. Intenta hacer login (aunque falle)
4. Verifica que las peticiones a `/api/*` vayan a la URL de Railway

**✅ Verifica:** Las peticiones deben ir a `ivan-reseller-web-production.up.railway.app`

---

## 🆘 TROUBLESHOOTING

### **Error: "Build failed"**

**Causa:** Root Directory no está configurado como `frontend`

**Solución:**
1. Vercel Dashboard → Tu proyecto → **Settings** → **General**
2. Busca **"Root Directory"**
3. Cambia a: `frontend`
4. Click **"Save"**
5. Haz un nuevo deploy

---

### **Error: "Cannot connect to API"**

**Causa:** Variable `VITE_API_URL` no está configurada o es incorrecta

**Solución:**
1. Vercel Dashboard → Tu proyecto → **Settings** → **Environment Variables**
2. Verifica que `VITE_API_URL` exista
3. Verifica que el valor sea correcto (sin `http://` ni `/api` al final)
4. Haz un nuevo deploy

---

### **Error: "CORS error" en el navegador**

**Causa:** CORS no está configurado correctamente en Railway

**Solución:**
1. Railway Dashboard → Variables → `CORS_ORIGIN`
2. Asegúrate de incluir la URL de Vercel
3. Railway se redesplegará automáticamente

---

## ✅ CHECKLIST COMPLETO

- [ ] Accediste a Vercel Dashboard
- [ ] Importaste el proyecto `GodinesCrazy/ivan-reseller-web`
- [ ] Configuraste Root Directory como `frontend`
- [ ] Configuraste Build Command como `npm run build`
- [ ] Configuraste Output Directory como `dist`
- [ ] Agregaste variable `VITE_API_URL` con la URL de Railway
- [ ] Hiciste deploy exitoso
- [ ] Obtuviste la URL de Vercel
- [ ] Actualizaste `CORS_ORIGIN` en Railway con la URL de Vercel
- [ ] Verificaste que el frontend carga correctamente
- [ ] Verificaste que las peticiones van al backend correcto

---

**¡Sigue estos pasos y tendrás el frontend funcionando en Vercel!** 🚀

