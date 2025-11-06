# 👤 CREAR USUARIO ADMIN - GUÍA SIMPLE

**El backend funciona, pero el usuario admin no existe. Vamos a crearlo.**

---

## 🎯 PASO 1: ABRIR CONSOLA EN RAILWAY

### **A. Ve a Railway:**

1. Railway Dashboard → Tu proyecto `ivan-reseller`
2. Click en el servicio **"ivan-reseller-web"**
3. Click en la pestaña **"Deployments"**
4. Busca el deployment más reciente que sea **exitoso** (verde, no el que falló)
5. Si todos fallaron, usa el que dice "Ready" o "Active"

### **B. Abrir consola:**

1. Click en el deployment exitoso
2. Busca un botón que diga **"Console"**, **"Terminal"**, **"Shell"**, o **"Open Shell"**
3. O busca un icono de terminal/shell
4. Click en él

---

## 🎯 PASO 2: EJECUTAR COMANDO

En la consola que se abra, escribe:

```bash
npx tsx prisma/seed.ts
```

Y presiona Enter.

**Esto creará:**
- Usuario admin: `admin` / `admin123`
- Usuario demo: `demo` / `demo123`

---

## 🎯 PASO 3: VERIFICAR

Después de ejecutar el comando, deberías ver:
```
✅ Usuario admin creado: admin
✅ Usuario demo creado: demo
```

---

## 🎯 PASO 4: PROBAR LOGIN

1. Abre: `https://ivan-reseller-web.vercel.app`
2. Intenta hacer login con:
   - Usuario: `admin`
   - Contraseña: `admin123`

---

**¿Puedes abrir la consola en Railway y ejecutar el comando?** 🚀

