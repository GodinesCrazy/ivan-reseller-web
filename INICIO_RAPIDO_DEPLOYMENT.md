# ⚡ INICIO RÁPIDO - DEPLOYMENT

**Repositorio:** `GodinesCrazy/ivan-reseller-web`

---

## 🚀 OPCIÓN 1: Script Automatizado (RECOMENDADO)

### **Ejecutar:**
```powershell
.\deploy-automatico.ps1
```

O doble clic en:
```
deploy-automatico.bat
```

**El script te guiará paso a paso** ✅

---

## 🚀 OPCIÓN 2: Guía Manual

### **Railway (Backend):**
Sigue: `DEPLOYMENT_RAILWAY_ESPECIFICO.md`

### **Vercel (Frontend):**
Sigue: `DEPLOYMENT_VERCEL_ESPECIFICO.md`

### **Completo:**
Sigue: `DEPLOYMENT_COMPLETO_ESPECIFICO.md`

---

## 📋 VARIABLES NECESARIAS

### **Railway:**
- `JWT_SECRET` (genera con script)
- `CORS_ORIGIN` (tu dominio)
- `DATABASE_URL` (auto-generada)
- `REDIS_URL` (auto-generada)

### **Vercel:**
- `VITE_API_URL` (URL de Railway)

---

## ✅ VERIFICACIÓN RÁPIDA

1. Backend: `https://tu-url.up.railway.app/health`
2. Frontend: `https://tu-proyecto.vercel.app`
3. Login: `demo` / `demo123`

---

**¡Ejecuta el script y sigue las instrucciones!** 🚀

