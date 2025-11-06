# 📋 GUÍA CLARA - PASO A PASO

**Vamos a solucionar el problema de login paso a paso, sin prisa.**

---

## 🎯 SITUACIÓN ACTUAL

✅ **Backend (Railway):** Funcionando (health check OK)  
✅ **Frontend (Vercel):** Funcionando (deployment exitoso)  
❌ **Problema:** Login falla con "Internal Server Error"

---

## 🔍 PASO 1: VERIFICAR VARIABLE EN VERCEL (PROYECTO ESPECÍFICO)

**IMPORTANTE:** Estás en la configuración del TEAM, no del PROYECTO.

### **A. Ir al proyecto específico:**

1. En la barra superior de Vercel, haz clic en **"Projects"**
2. Busca y haz clic en el proyecto **"ivan-reseller-web"**
3. O ve directamente a:
   ```
   https://vercel.com/ivan-martys-projects/ivan-reseller-web/settings/environment-variables
   ```

### **B. Verificar variable:**

1. En la sección **"Environment Variables"**
2. Busca si existe: `VITE_API_URL`
3. **Si NO existe:**
   - Click **"+ Add New"**
   - **Key:** `VITE_API_URL`
   - **Value:** `https://ivan-reseller-web-production.up.railway.app`
   - **Environments:** Selecciona todas (Production, Preview, Development)
   - Click **"Save"**
   - **IMPORTANTE:** Después de guardar, haz un **redeploy** (Settings → Deployments → Redeploy)

---

## 🔍 PASO 2: CREAR USUARIO ADMIN EN RAILWAY

Veo que Railway tiene el servicio fallando. Primero arreglemos eso, luego creamos el admin.

### **A. Ver logs del error en Railway:**

1. Railway Dashboard → Click en **"ivan-reseller-web"** (el que está fallando)
2. Click en **"Deployments"**
3. Click en el deployment más reciente (el que falló)
4. Busca **"View Logs"** o **"Logs"**
5. **Copia el error completo** y compártelo

### **B. Después de arreglar Railway, crear admin:**

1. Railway Dashboard → Tu servicio → **Deployments**
2. Click en el deployment exitoso
3. Busca **"Console"** o **"Terminal"**
4. Ejecuta:
   ```bash
   npx tsx prisma/seed.ts
   ```

---

## 🔍 PASO 3: VERIFICAR CORS EN RAILWAY

Veo que tienes `CORS_ORIGIN` configurada. Verifica que incluya:

```
https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-web.vercel.app
```

---

## 📋 CHECKLIST SIMPLE

### **Vercel:**
- [ ] Estoy en el PROYECTO específico (no en Team)
- [ ] Variable `VITE_API_URL` existe
- [ ] Valor es: `https://ivan-reseller-web-production.up.railway.app`
- [ ] Redesplegué después de agregar la variable

### **Railway:**
- [ ] El servicio está funcionando (no fallando)
- [ ] Usuario admin existe (ejecuté seed)
- [ ] CORS incluye URL de Vercel

---

**¡Empieza por el PASO 1 y dime qué ves!** 🚀

