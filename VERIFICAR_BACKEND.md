# ✅ VERIFICAR BACKEND - GUÍA RÁPIDA

**El error "Route not found" en la raíz es NORMAL. El backend solo responde en rutas `/api/*`**

---

## ✅ VERIFICACIÓN RÁPIDA

### **1. Health Check (debe funcionar):**
```
https://ivan-reseller-web-production.up.railway.app/health
```
Debería mostrar: `{"status":"ok"}`

### **2. Login API (probando directamente):**
El backend debería responder. Si no funciona, el problema es que el usuario admin no existe.

---

## 🎯 PRÓXIMOS PASOS

### **PASO 1: Verificar Variable en Vercel**

1. Ve a: https://vercel.com/ivan-martys-projects/ivan-reseller-web/settings/environment-variables
2. Verifica que `VITE_API_URL` exista
3. Si no existe, agrégala

### **PASO 2: Crear Usuario Admin en Railway**

1. Railway → Tu servicio → Deployments
2. Click en deployment exitoso
3. Busca "Console" o "Terminal"
4. Ejecuta: `npx tsx prisma/seed.ts`

---

**El error "Route not found" en la raíz es normal. El problema real es el login desde el frontend.** 🔍

