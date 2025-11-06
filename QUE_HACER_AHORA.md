# ⚡ ¿QUÉ HACER AHORA? - GUÍA SIMPLE

**No te preocupes, vamos paso a paso. Empecemos por lo más importante.**

---

## 🎯 TAREA 1: CONFIGURAR VARIABLE EN VERCEL (5 minutos)

### **¿Qué hacer?**

1. Ve a: https://vercel.com/ivan-martys-projects/ivan-reseller-web
2. Click en **"Settings"**
3. Click en **"Environment Variables"** (en el menú lateral)
4. Verifica si existe `VITE_API_URL`
5. Si NO existe, agrégala con el valor: `https://ivan-reseller-web-production.up.railway.app`
6. Guarda y **redesplega**

---

## 🎯 TAREA 2: VER POR QUÉ FALLA RAILWAY (5 minutos)

### **¿Qué hacer?**

1. Railway Dashboard → Click en **"ivan-reseller-web"** (el que está fallando)
2. Click en **"Deployments"**
3. Click en el deployment más reciente (el que falló)
4. Click en **"View Logs"** o **"Logs"**
5. **Copia el error completo** y compártelo

Con el error podré decirte exactamente qué hacer.

---

## 🎯 TAREA 3: CREAR USUARIO ADMIN (2 minutos)

Después de que Railway funcione:

1. Railway → Deployments → Deployment exitoso
2. Busca **"Console"** o botón de terminal
3. Ejecuta: `npx tsx prisma/seed.ts`

---

**¿Empiezas por la TAREA 1? Cuando termines, dime qué viste y seguimos.** 🚀

