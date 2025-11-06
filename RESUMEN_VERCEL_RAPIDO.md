# ⚡ RESUMEN RÁPIDO - VERCEL

**Guía rápida de referencia para configurar Vercel**

---

## 🎯 CONFIGURACIÓN RÁPIDA

### **URLs Importantes:**
- **Vercel Dashboard:** https://vercel.com/ivan-martys-projects
- **Repositorio:** `GodinesCrazy/ivan-reseller-web`
- **Backend URL:** `https://ivan-reseller-web-production.up.railway.app`

---

## 📋 VALORES EXACTOS PARA VERCEL

### **Settings → General:**
```
Root Directory: frontend
```

### **Settings → Build & Development Settings:**
```
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

### **Settings → Environment Variables:**
```
VITE_API_URL = https://ivan-reseller-web-production.up.railway.app
```

---

## 🔄 DESPUÉS DEL DEPLOY

### **1. Obtener URL de Vercel:**
```
https://tu-proyecto-xxxx.vercel.app
```

### **2. Actualizar CORS en Railway:**
```
CORS_ORIGIN = https://www.ivanreseller.com,https://ivanreseller.com,https://tu-proyecto-xxxx.vercel.app
```

---

## ✅ VERIFICACIÓN

1. **Frontend carga:** URL de Vercel → Login page
2. **Backend responde:** Railway URL/health → `{"status":"ok"}`
3. **Conexión funciona:** Consola navegador → Peticiones a Railway

---

**Ver guía completa:** `GUIA_PASO_A_PASO_VERCEL.md`

