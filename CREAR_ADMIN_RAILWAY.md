# 👤 CREAR USUARIO ADMIN EN RAILWAY

**Guía para crear el usuario admin en la base de datos de Railway.**

---

## 🎯 OPCIÓN 1: USAR RAILWAY CLI (RECOMENDADO)

### **A. Instalar Railway CLI:**

```powershell
npm install -g @railway/cli
```

### **B. Login y conectar:**

```powershell
railway login
railway link
```

### **C. Ejecutar seed:**

```powershell
railway run npx tsx prisma/seed.ts
```

---

## 🎯 OPCIÓN 2: DESDE RAILWAY DASHBOARD

### **A. Abrir consola del servicio:**

1. Railway Dashboard → Tu servicio `ivan-reseller-web`
2. Click en **"Deployments"**
3. Click en el deployment más reciente
4. Busca **"View Logs"** o **"Console"**
5. O ve a **"Settings"** → **"Deployments"** → **"Deploy Hooks"**

### **B. Ejecutar comando:**

```bash
npx tsx prisma/seed.ts
```

---

## 🎯 OPCIÓN 3: CREAR SCRIPT ESPECÍFICO

Si el seed no funciona, podemos crear un script simple para crear solo el admin:

```bash
cd backend
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

(async () => {
  const password = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { password },
    create: {
      username: 'admin',
      email: 'admin@ivanreseller.com',
      password,
      role: 'ADMIN',
      isActive: true
    }
  });
  console.log('✅ Admin creado:', admin.username);
  await prisma.\$disconnect();
})();
"
```

---

## ✅ VERIFICACIÓN

Después de ejecutar el seed:

1. **Verificar que el usuario existe:**
   - Intenta hacer login con: `admin` / `admin123`
   - Debe funcionar

2. **Si sigue fallando:**
   - Verifica los logs de Railway para ver el error específico
   - Verifica que la variable `VITE_API_URL` esté configurada en Vercel

---

**¡Sigue una de estas opciones para crear el usuario admin!** 🚀

