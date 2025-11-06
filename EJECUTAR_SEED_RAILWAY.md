# 🚀 CÓMO EJECUTAR `npx prisma db seed` EN RAILWAY

**Guía paso a paso para crear el usuario admin en Railway**

---

## 📋 PASO A PASO

### **PASO 1: Ir a Deployments**

1. Estás en la página **"Settings"** de `ivan-reseller-web`
2. En la parte superior, verás pestañas: **Deployments**, **Variables**, **Metrics**, **Settings**
3. **Click en "Deployments"** (primera pestaña)

---

### **PASO 2: Abrir el Deployment**

1. Verás una lista de deployments
2. Busca el deployment más reciente que esté:
   - ✅ **"Active"** (activo)
   - ✅ **"Ready"** (listo)
   - ✅ Con un checkmark verde ✅
3. **Click en ese deployment** (no importa si dice "Failed" en el último, busca uno que funcione)

---

### **PASO 3: Abrir la Consola**

1. Dentro del deployment, busca:
   - Un botón que diga **"Console"**
   - O un botón que diga **"Terminal"**
   - O un icono de terminal/shell (📟)
   - O un botón **"Shell"**
2. **Click en ese botón**

---

### **PASO 4: Ejecutar el Comando**

1. Se abrirá una consola/terminal en la parte inferior o en una nueva ventana
2. Escribe o pega este comando:
   ```bash
   npx prisma db seed
   ```
3. Presiona **Enter**

---

### **PASO 5: Verificar Resultado**

Deberías ver algo como:
```
🌱 Iniciando seed de la base de datos...
✅ Usuario admin creado: admin
✅ Usuario demo creado: demo
```

---

## 🎯 COMANDOS ALTERNATIVOS (si el anterior no funciona)

Si `npx prisma db seed` no funciona, prueba estos en orden:

### **Opción 1:**
```bash
npm run prisma:seed
```

### **Opción 2:**
```bash
npx tsx prisma/seed.ts
```

### **Opción 3:**
```bash
cd backend && npx prisma db seed
```

---

## ⚠️ SI NO VES LA OPCIÓN "CONSOLE"

**Método alternativo: Usar Variables de Railway**

1. Ve a la pestaña **"Variables"** (en Settings)
2. Agrega una variable temporal:
   - **Key:** `RUN_SEED`
   - **Value:** `true`
3. Railway ejecutará el seed automáticamente en el próximo deployment

**O mejor aún, crea un script de inicio:**

1. Ve a **Settings** → **Build & Deploy**
2. Busca **"Start Command"**
3. Cambia a:
   ```bash
   npx prisma db seed && npm start
   ```

---

## ✅ DESPUÉS DE EJECUTAR EL SEED

1. **Prueba el login:**
   - Ve a: `https://ivan-reseller-web.vercel.app`
   - Usuario: `admin`
   - Contraseña: `admin123`

2. **Si funciona:** ✅ ¡Listo!

3. **Si no funciona:** Verifica que la variable `VITE_API_URL` esté en Vercel

---

**¡Intenta el PASO 1 y dime qué ves!** 🚀

