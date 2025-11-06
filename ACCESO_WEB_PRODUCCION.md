# 🌐 ACCESO AL SISTEMA EN PRODUCCIÓN (HOSTING)

## 🚀 URLs DE ACCESO

### **Backend API (Railway)**
```
https://ivan-reseller-web-production.up.railway.app
```

### **Frontend (Vercel)**
Si tienes Vercel configurado, debería estar en:
```
https://tu-proyecto.vercel.app
```

O si configuraste dominio personalizado:
```
https://www.ivanreseller.com
https://ivanreseller.com
```

---

## 🔐 CREDENCIALES DE LOGIN

Una vez que accedas al frontend, usa estas credenciales:

```
Username: admin
Password: admin123
```

---

## ✅ PASOS PARA ACCEDER

### **1. Verificar que el Backend está Activo**

Abre en tu navegador:
```
https://ivan-reseller-web-production.up.railway.app/health
```

Deberías ver:
```json
{
  "status": "ok",
  "timestamp": "..."
}
```

### **2. Acceder al Frontend**

#### **Opción A: Si tienes Vercel configurado**

1. Ve a: `https://tu-proyecto.vercel.app`
2. O si tienes dominio: `https://www.ivanreseller.com`
3. Deberías ver la página de login
4. Ingresa:
   - Username: `admin`
   - Password: `admin123`
5. Click en "Sign in"

#### **Opción B: Si NO tienes Vercel configurado**

Necesitas desplegar el frontend primero. Ver: `DEPLOYMENT_VERCEL_ESPECIFICO.md`

---

## 🔍 VERIFICAR CONFIGURACIÓN

### **1. Verificar Variables en Railway**

Railway Dashboard → Tu servicio `ivan-reseller-web` → **"Variables"**

Debes tener:
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=[debe tener 32+ caracteres]
JWT_EXPIRES_IN=7d
DATABASE_URL=[auto-generada de PostgreSQL]
CORS_ORIGIN=https://tu-frontend.vercel.app,https://www.ivanreseller.com
```

### **2. Verificar Variables en Vercel (si aplica)**

Vercel Dashboard → Tu Proyecto → **"Settings"** → **"Environment Variables"**

Debes tener:
```env
VITE_API_URL=https://ivan-reseller-web-production.up.railway.app
```

---

## 🛠️ TROUBLESHOOTING

### **Error: "Cannot connect to API"**

**Causa:** El frontend no puede conectarse al backend.

**Solución:**
1. Verifica que `VITE_API_URL` en Vercel esté correcto
2. Debe ser: `https://ivan-reseller-web-production.up.railway.app`
3. Verifica que `CORS_ORIGIN` en Railway incluya la URL de Vercel

### **Error: "CORS policy blocked"**

**Causa:** Railway no permite conexiones desde tu frontend.

**Solución:**
1. Railway Dashboard → Variables
2. Actualiza `CORS_ORIGIN` para incluir tu URL de Vercel:
   ```env
   CORS_ORIGIN=https://tu-proyecto.vercel.app,https://www.ivanreseller.com
   ```
3. Railway se redesplegará automáticamente

### **Error: "502 Bad Gateway" o "Route not found"**

**Causa:** El backend no está corriendo o hay error en Railway.

**Solución:**
1. Railway Dashboard → Tu servicio → **"Deployments"**
2. Verifica que el último deployment sea exitoso
3. Click en el deployment para ver logs
4. Si hay errores, revisa los logs y corrige

### **Error: "Database connection failed"**

**Causa:** PostgreSQL no está configurado o `DATABASE_URL` es incorrecta.

**Solución:**
1. Railway Dashboard → Verifica que PostgreSQL esté agregado
2. Railway Dashboard → Variables → Verifica que `DATABASE_URL` exista
3. Si no existe, Railway lo crea automáticamente al agregar PostgreSQL

### **Error: "JWT_SECRET must be at least 32 characters"**

**Causa:** `JWT_SECRET` es muy corto o no está configurado.

**Solución:**
1. Genera un nuevo JWT_SECRET:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Railway Dashboard → Variables → Actualiza `JWT_SECRET`
3. Railway se redesplegará automáticamente

---

## 📋 CHECKLIST DE VERIFICACIÓN

Antes de acceder, verifica:

- [ ] Backend está desplegado en Railway
- [ ] PostgreSQL está agregado y corriendo
- [ ] Variables de entorno están configuradas en Railway
- [ ] Frontend está desplegado en Vercel (o dominio configurado)
- [ ] `VITE_API_URL` en Vercel apunta al backend de Railway
- [ ] `CORS_ORIGIN` en Railway incluye la URL del frontend
- [ ] Health check responde: `/health`
- [ ] Puedes acceder al frontend sin errores

---

## 🎯 ACCESO RÁPIDO

### **URL del Backend:**
```
https://ivan-reseller-web-production.up.railway.app
```

### **URL del Frontend (ejemplo):**
```
https://tu-proyecto.vercel.app
```

### **Credenciales:**
```
Username: admin
Password: admin123
```

---

## 📞 MÁS INFORMACIÓN

- **Deployment Railway:** `DEPLOYMENT_RAILWAY_ESPECIFICO.md`
- **Deployment Vercel:** `DEPLOYMENT_VERCEL_ESPECIFICO.md`
- **Variables de Entorno:** `GUIA_VARIABLES_ENTORNO.md`
- **Troubleshooting:** Revisa los logs en Railway y Vercel

---

**¡Listo para acceder a tu sistema en producción!** 🎉

