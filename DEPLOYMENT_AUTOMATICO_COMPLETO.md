# 🤖 DEPLOYMENT AUTOMÁTICO COMPLETO

**Guía para automatizar el deployment usando CLI tools**

---

## 🛠️ HERRAMIENTAS CREADAS

### **1. Script Interactivo (Recomendado para Principiantes)**
- ✅ `deploy-automatico.ps1` - Guía paso a paso completa
- ✅ `deploy-automatico.bat` - Versión Windows

**Uso:**
```powershell
.\deploy-automatico.ps1
```

### **2. Scripts con CLI (Para Usuarios Avanzados)**
- ✅ `deploy-railway-cli.ps1` - Deployment con Railway CLI
- ✅ `deploy-vercel-cli.ps1` - Deployment con Vercel CLI

**Requisitos:**
```bash
# Instalar CLIs
npm install -g @railway/cli
npm install -g vercel

# Login (primera vez)
railway login
vercel login
```

---

## 🚀 OPCIÓN 1: Script Interactivo (MÁS FÁCIL)

### **Ejecutar:**
```powershell
.\deploy-automatico.ps1
```

### **Qué hace:**
1. ✅ Verifica Git y configuración
2. ✅ Genera JWT_SECRET automáticamente
3. ✅ Te guía paso a paso para Railway
4. ✅ Te guía paso a paso para Vercel
5. ✅ Guarda URLs para referencia
6. ✅ Te da instrucciones exactas para cada paso

**Tiempo:** 20-30 minutos siguiendo las instrucciones

---

## 🚀 OPCIÓN 2: Railway CLI (AUTOMÁTICO)

### **Instalar:**
```bash
npm install -g @railway/cli
railway login
```

### **Ejecutar Script:**
```powershell
.\deploy-railway-cli.ps1
```

### **O Manualmente:**
```bash
cd backend
railway init
railway add postgresql
railway add redis
railway variables set NODE_ENV=production
railway variables set JWT_SECRET=[genera uno]
railway variables set CORS_ORIGIN=https://www.ivanreseller.com
railway up
```

**Ventajas:**
- ✅ Todo desde terminal
- ✅ Más rápido
- ✅ Automatizable

---

## 🚀 OPCIÓN 3: Vercel CLI (AUTOMÁTICO)

### **Instalar:**
```bash
npm install -g vercel
vercel login
```

### **Ejecutar Script:**
```powershell
.\deploy-vercel-cli.ps1
```

### **O Manualmente:**
```bash
cd frontend
vercel
# Sigue las instrucciones interactivas
vercel env add VITE_API_URL production
# Ingresa la URL de Railway
vercel --prod
```

**Ventajas:**
- ✅ Todo desde terminal
- ✅ Más rápido
- ✅ Automatizable

---

## 🎯 RECOMENDACIÓN

### **Si es tu primera vez:**
✅ Usa `deploy-automatico.ps1` (script interactivo)

### **Si ya tienes experiencia:**
✅ Usa Railway CLI + Vercel CLI (más rápido)

---

## 📋 CHECKLIST AUTOMÁTICO

El script `deploy-automatico.ps1` verifica:
- [x] Git configurado
- [x] Cambios commiteados
- [x] JWT_SECRET generado
- [x] URLs guardadas
- [x] Instrucciones mostradas

---

## 🆘 SI ALGO FALLA

1. **Revisa logs:**
   - Railway: Dashboard → Deployments → Logs
   - Vercel: Dashboard → Deployments → Logs

2. **Verifica variables:**
   - Todas las variables están configuradas
   - JWT_SECRET tiene 32+ caracteres
   - CORS_ORIGIN incluye tu dominio

3. **Consulta documentación:**
   - `DEPLOYMENT_INMEDIATO.md`
   - `DEPLOYMENT_COMPLETO_PRODUCCION.md`

---

## ✅ TODO LISTO

**Ejecuta el script y sigue las instrucciones:**
```powershell
.\deploy-automatico.ps1
```

**¡El script te guiará en todo!** 🚀

