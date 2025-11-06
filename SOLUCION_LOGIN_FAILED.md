# 🔧 SOLUCIÓN: LOGIN FAILED - PASOS INMEDIATOS

**El login está fallando. Sigue estos pasos en orden para solucionarlo.**

---

## 🎯 PASO 1: VERIFICAR VARIABLE VITE_API_URL EN VERCEL (CRÍTICO)

### **1. Ve a Vercel Dashboard:**
```
https://vercel.com/ivan-martys-projects/ivan-reseller-web/settings/environment-variables
```

### **2. Verifica que existe:**
```
VITE_API_URL = https://ivan-reseller-web-production.up.railway.app
```

### **3. Si NO existe o está incorrecta:**
1. Click **"Add New"** (o edita la existente)
2. **Name:** `VITE_API_URL`
3. **Value:** `https://ivan-reseller-web-production.up.railway.app`
4. **Environments:** Todas (Production, Preview, Development)
5. Click **"Save"**
6. **IMPORTANTE:** Haz un **redeploy** después de agregar/actualizar:
   - Ve a **"Deployments"**
   - Click en el deployment más reciente
   - Click **"Redeploy"**

---

## 🎯 PASO 2: CREAR USUARIO ADMIN EN RAILWAY

### **Opción A: Usar Railway CLI (Recomendado)**

1. **Instalar Railway CLI:**
   ```powershell
   npm install -g @railway/cli
   ```

2. **Login:**
   ```powershell
   railway login
   ```

3. **Conectar al proyecto:**
   ```powershell
   railway link
   # Selecciona tu proyecto: ivan-reseller
   ```

4. **Ejecutar seed:**
   ```powershell
   cd backend
   railway run npx tsx prisma/seed.ts
   ```

### **Opción B: Desde Railway Dashboard**

1. Railway Dashboard → Tu servicio `ivan-reseller-web`
2. Click en **"Deployments"**
3. Click en el deployment más reciente (el activo)
4. Busca **"View Logs"** o **"Console"** o **"Terminal"**
5. Ejecuta:
   ```bash
   npx tsx prisma/seed.ts
   ```

**Deberías ver:**
```
🌱 Iniciando seed de la base de datos...
✅ Usuario admin creado: admin
✅ Usuario demo creado: demo
```

---

## 🎯 PASO 3: ACTUALIZAR CORS EN RAILWAY

1. Railway Dashboard → Tu servicio → **"Variables"**
2. Busca `CORS_ORIGIN`
3. Actualiza a (incluye TODAS las URLs posibles):
   ```
   https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app,https://ivan-reseller-web-production.up.railway.app
   ```
4. Click **"Save"**
5. Railway se redesplegará automáticamente

---

## ✅ VERIFICACIÓN PASO A PASO

### **1. Verificar Backend está activo:**
Abre en tu navegador:
```
https://ivan-reseller-web-production.up.railway.app/health
```
**Debe mostrar:** `{"status":"ok"}`

### **2. Verificar que el endpoint de login existe:**
Abre en tu navegador:
```
https://ivan-reseller-web-production.up.railway.app/api/auth/login
```
**Debe mostrar:** Un error de método (POST required), NO "Route not found"

### **3. Verificar en consola del navegador:**
1. Abre tu frontend: `https://ivan-reseller-web.vercel.app`
2. Abre **DevTools** (F12)
3. Ve a la pestaña **"Network"**
4. Intenta hacer login con:
   - Username: `admin`
   - Password: `admin123`
5. Busca la petición a `/api/auth/login`
6. **Copia el error exacto** que aparece

### **4. Verificar que VITE_API_URL está correcta:**
En la consola del navegador (F12 → Console), ejecuta:
```javascript
console.log(import.meta.env.VITE_API_URL)
```
**Debe mostrar:** `https://ivan-reseller-web-production.up.railway.app`

---

## 🆘 ERRORES COMUNES Y SOLUCIONES

### **Error: "Cannot connect to API"**
**Causa:** `VITE_API_URL` no está configurada o es incorrecta.

**Solución:**
1. Verifica `VITE_API_URL` en Vercel
2. Haz un redeploy después de actualizarla

### **Error: "Invalid credentials"**
**Causa:** El usuario admin no existe en la base de datos.

**Solución:**
1. Ejecuta el seed en Railway (Paso 2)
2. Verifica que el usuario se creó correctamente

### **Error: "CORS policy blocked"**
**Causa:** `CORS_ORIGIN` no incluye la URL de Vercel.

**Solución:**
1. Actualiza `CORS_ORIGIN` en Railway (Paso 3)
2. Espera a que Railway redesplegue

### **Error: "Network Error" o "Failed to fetch"**
**Causa:** El backend no está respondiendo o hay un problema de conexión.

**Solución:**
1. Verifica que el backend está activo (`/health`)
2. Verifica los logs de Railway para errores
3. Verifica que el puerto 3000 está abierto

---

## 📋 CHECKLIST FINAL

Antes de intentar login de nuevo, verifica:

- [ ] `VITE_API_URL` está configurada en Vercel
- [ ] Se hizo redeploy después de actualizar `VITE_API_URL`
- [ ] El seed se ejecutó en Railway
- [ ] `CORS_ORIGIN` incluye la URL de Vercel
- [ ] Backend responde en `/health`
- [ ] Endpoint `/api/auth/login` existe

---

## 🔍 DIAGNÓSTICO AVANZADO

Si después de seguir todos los pasos el login sigue fallando:

### **1. Ver logs de Railway:**
Railway Dashboard → Tu servicio → **"Logs"**
- Busca errores relacionados con base de datos
- Busca errores relacionados con autenticación
- Busca errores relacionados con CORS

### **2. Ver logs de Vercel:**
Vercel Dashboard → Tu proyecto → **"Deployments"** → Click en el deployment → **"Build Logs"**
- Verifica que el build fue exitoso
- Verifica que las variables de entorno se cargaron correctamente

### **3. Probar login directamente con curl:**
```powershell
curl -X POST https://ivan-reseller-web-production.up.railway.app/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"username":"admin","password":"admin123"}'
```

**Debería devolver un token si funciona correctamente.**

---

## 📞 INFORMACIÓN PARA REPORTAR

Si necesitas ayuda adicional, proporciona:

1. **Error exacto** que ves en la consola del navegador
2. **Respuesta del backend** (en Network tab)
3. **Estado de `VITE_API_URL`** en Vercel
4. **Estado del seed** (¿se ejecutó correctamente?)
5. **Logs de Railway** (si hay errores)

---

**¡Sigue estos pasos en orden y el login debería funcionar!** 🚀

