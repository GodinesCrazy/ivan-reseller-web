# 🔧 SOLUCIÓN: ERROR 502 BAD GATEWAY - LOGIN FAILED

**Problema detectado:** Error `502 Bad Gateway` en el preflight request.

Esto significa que el frontend (Vercel) no puede conectarse al backend (Railway).

---

## 🎯 PASO 1: VERIFICAR QUE EL BACKEND ESTÁ CORRIENDO

### **1. Prueba el Health Check:**
Abre en tu navegador:
```
https://ivan-reseller-web-production.up.railway.app/health
```

**Si responde `{"status":"ok"}`:**
- ✅ El backend está corriendo
- → Ve al PASO 2

**Si NO responde o da error 502:**
- ❌ El backend NO está corriendo o hay un error
- → Ve al PASO 4 (Ver logs de Railway)

---

## 🎯 PASO 2: VERIFICAR CORS EN RAILWAY (CRÍTICO)

### **1. Ve a Railway Variables:**
Railway Dashboard → Tu servicio `ivan-reseller-web` → **"Variables"**

### **2. Verifica `CORS_ORIGIN`:**

**Debe incluir la URL de Vercel:**
```
https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
```

**Si NO está o está incompleto:**
1. Edita o agrega `CORS_ORIGIN`
2. Valor exacto:
   ```
   https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
   ```
3. Click **"Save"**
4. Railway se redesplegará automáticamente
5. Espera 2-3 minutos

---

## 🎯 PASO 3: VERIFICAR QUE EL USUARIO ADMIN EXISTE

El error 502 puede ser porque el backend está crasheando al intentar iniciar.

### **Opción A: Usar Railway CLI (Recomendado)**

```powershell
# 1. Instalar Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Conectar al proyecto
railway link
# Selecciona: ivan-reseller

# 4. Ejecutar seed
cd backend
railway run npx tsx prisma/seed.ts
```

**Deberías ver:**
```
🌱 Iniciando seed de la base de datos...
✅ Usuario admin creado: admin
✅ Usuario demo creado: demo
```

### **Opción B: Desde Railway Dashboard**

1. Railway Dashboard → Tu servicio → **"Deployments"**
2. Click en el deployment más reciente
3. Busca **"View Logs"** o **"Console"** o **"Terminal"**
4. Ejecuta:
   ```bash
   npx tsx prisma/seed.ts
   ```

---

## 🎯 PASO 4: VERIFICAR LOGS DE RAILWAY

### **1. Ve a Railway Logs:**
Railway Dashboard → Tu servicio → **"Logs"**

### **2. Busca estos errores comunes:**

#### **Error: "Database connection failed"**
**Causa:** `DATABASE_URL` incorrecta o PostgreSQL no está corriendo.

**Solución:**
1. Railway Dashboard → Verifica que PostgreSQL esté agregado y corriendo
2. Railway Dashboard → Variables → Verifica que `DATABASE_URL` exista (se crea automáticamente)

#### **Error: "JWT_SECRET must be at least 32 characters"**
**Causa:** `JWT_SECRET` es muy corto o no está configurado.

**Solución:**
1. Genera un nuevo JWT_SECRET:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Railway Dashboard → Variables → Actualiza `JWT_SECRET`
3. Railway se redesplegará automáticamente

#### **Error: "Prisma schema validation"**
**Causa:** `DATABASE_URL` no tiene el formato correcto.

**Solución:**
1. Railway Dashboard → Variables
2. Verifica que `DATABASE_URL` empiece con `postgresql://` o `postgres://`
3. Si no, Railway lo crea automáticamente al agregar PostgreSQL

#### **Error: "Cannot find module"**
**Causa:** Dependencias no instaladas o build falló.

**Solución:**
1. Railway Dashboard → Deployments
2. Verifica que el último deployment sea exitoso
3. Si falló, revisa los logs del build

---

## 🎯 PASO 5: VERIFICAR VARIABLES DE ENTORNO EN RAILWAY

Railway Dashboard → Tu servicio → **"Variables"**

**Debe tener estas variables:**
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=[debe tener 32+ caracteres]
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
DATABASE_URL=[auto-generada de PostgreSQL]
LOG_LEVEL=info
```

**Si falta alguna, agrégala.**

---

## ✅ VERIFICACIÓN FINAL

### **1. Backend Health Check:**
```
https://ivan-reseller-web-production.up.railway.app/health
```
**Debe mostrar:** `{"status":"ok"}`

### **2. Probar Login API directamente:**
Abre en tu navegador (o usa curl):
```
https://ivan-reseller-web-production.up.railway.app/api/auth/login
```
**Debe mostrar:** Un error de método (POST required), NO "502" ni "Route not found"

### **3. Probar desde el frontend:**
1. Abre: `https://ivan-reseller-web.vercel.app/login`
2. Abre DevTools (F12) → Network
3. Intenta login con: `admin` / `admin123`
4. **Verifica que:**
   - El preflight request (OPTIONS) tenga status 200 o 204
   - El login request (POST) tenga status 200 (no 502)

---

## 🆘 SI AÚN FALLA DESPUÉS DE TODO

### **1. Ver logs completos de Railway:**
Railway Dashboard → Tu servicio → **"Logs"**
- Copia los últimos 100-200 líneas
- Busca errores en rojo

### **2. Verificar que Railway está desplegado:**
Railway Dashboard → **"Deployments"**
- Verifica que el último deployment sea exitoso (✅)
- Si hay un deployment fallido, click en él para ver los logs

### **3. Forzar redeploy:**
1. Railway Dashboard → Tu servicio → **"Deployments"**
2. Click en el deployment más reciente
3. Click **"Redeploy"**

### **4. Verificar que PostgreSQL está corriendo:**
Railway Dashboard → Verifica que el servicio PostgreSQL esté activo (no pausado)

---

## 📋 CHECKLIST COMPLETO

Antes de intentar login de nuevo:

- [ ] Backend responde en `/health`
- [ ] `CORS_ORIGIN` incluye la URL de Vercel
- [ ] Todas las variables de entorno están configuradas
- [ ] El seed se ejecutó correctamente
- [ ] El último deployment en Railway es exitoso
- [ ] PostgreSQL está corriendo
- [ ] No hay errores en los logs de Railway

---

**Sigue estos pasos en orden y el error 502 debería resolverse.** 🚀

