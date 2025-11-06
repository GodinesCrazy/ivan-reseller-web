# 📍 DÓNDE ESTÁ ROOT DIRECTORY EN VERCEL

**El "Root Directory" NO está en "General", está en "Build and Deployment Settings".**

---

## 🎯 PASO 1: IR A BUILD AND DEPLOYMENT SETTINGS

1. **En el menú lateral izquierdo** (donde está "General", "Build and Deployment", etc.)
2. **Click en "Build and Deployment"** (está justo debajo de "General")
3. Esto te llevará a la sección donde está el "Root Directory"

---

## 🎯 PASO 2: BUSCAR ROOT DIRECTORY

En la sección "Build and Deployment Settings", deberías ver:

- **Framework Preset**
- **Build Command**
- **Output Directory**
- **Install Command**
- **Root Directory** ← **AQUÍ ESTÁ**

---

## 🎯 PASO 3: CONFIGURAR ROOT DIRECTORY

1. **Busca el campo "Root Directory"**
2. **Debe decir:** `frontend`
3. **Si está vacío o dice algo diferente:**
   - Cambia a: `frontend`
   - Click **"Save"**

---

**¡Ve a "Build and Deployment" en el menú lateral y encontrarás el Root Directory!** 🚀

