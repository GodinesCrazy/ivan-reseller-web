# 🔐 VARIABLES DE ENTORNO - EXPLICACIÓN SIMPLE

## ¿Qué son las Variables de Entorno?

Son como "ajustes" que el sistema necesita para funcionar. Son diferentes según dónde esté corriendo (tu computadora vs servidor de producción).

### **Ejemplo Simple:**

```
En tu computadora (desarrollo):
DATABASE_URL = "file:./dev.db"  (base de datos local)

En producción (servidor):
DATABASE_URL = "postgresql://user:pass@servidor.com:5432/db"  (base de datos remota)
```

### **¿Por qué son importantes?**

1. **Seguridad:** Contienen secretos (claves, passwords) que NO deben estar en el código
2. **Flexibilidad:** Permiten cambiar configuraciones sin modificar código
3. **Ambientes:** Diferentes valores para desarrollo vs producción

---

## 📝 ¿DÓNDE SE CONFIGURAN?

### **En Desarrollo (tu computadora):**
- Archivo: `backend/.env` (debes crearlo desde `.env.example`)
- Archivo: `frontend/.env` (debes crearlo desde `.env.example`)

### **En Producción (Railway/Vercel):**
- **Railway (Backend):** Dashboard → Tu servicio → "Variables"
- **Vercel (Frontend):** Dashboard → Tu proyecto → Settings → Environment Variables

---

## ✅ VARIABLES OBLIGATORIAS (Mínimo para funcionar)

### **Backend - OBLIGATORIAS:**

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=[Railway lo genera automáticamente]
JWT_SECRET=[GENERA UNO SEGURO - VER ABAJO]
CORS_ORIGIN=https://www.ivanreseller.com
```

### **Frontend - OBLIGATORIAS:**

```env
VITE_API_URL=https://api.ivanreseller.com
# O la URL directa de Railway: https://tu-backend.up.railway.app
```

---

## 🔑 CÓMO GENERAR JWT_SECRET SEGURO

**En tu terminal (Windows PowerShell):**
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Copia el resultado** y úsalo como valor de `JWT_SECRET`

---

## 🎯 CONFIGURACIÓN PARA www.ivanreseller.com

### **Paso 1: Railway (Backend)**

Variables a configurar en Railway:

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=[el que generaste arriba]
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
LOG_LEVEL=info
```

**Después de obtener URL de Vercel, actualizar CORS_ORIGIN:**
```env
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-xxxx.vercel.app
```

### **Paso 2: Vercel (Frontend)**

Variables a configurar en Vercel:

```env
VITE_API_URL=https://api.ivanreseller.com
# O si no tienes subdominio:
# VITE_API_URL=https://tu-backend-production.up.railway.app
```

---

## 📋 VARIABLES OPCIONALES (pero Recomendadas)

### **Para Pagos Automáticos:**
```env
PAYPAL_CLIENT_ID=tu_client_id
PAYPAL_CLIENT_SECRET=tu_client_secret
PAYPAL_ENVIRONMENT=production
```

### **Para Cron Jobs:**
```env
REDIS_URL=[Railway lo genera automáticamente al agregar Redis]
```

---

## 🚀 RESUMEN RÁPIDO

**Para subir a www.ivanreseller.com necesitas:**

1. **Generar JWT_SECRET** (comando arriba)
2. **Configurar en Railway:**
   - `JWT_SECRET` (el que generaste)
   - `CORS_ORIGIN` (tu dominio)
3. **Configurar en Vercel:**
   - `VITE_API_URL` (URL del backend)
4. **Listo!** El resto se configura automáticamente

---

**¿Necesitas más detalles?** Revisa `DEPLOYMENT_INMEDIATO.md` para pasos específicos.

