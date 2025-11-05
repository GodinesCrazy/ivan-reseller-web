# ▲ DEPLOYMENT EN VERCEL - PROYECTO ESPECÍFICO

**Repositorio:** `GodinesCrazy/ivan-reseller-web`  
**URL Vercel:** https://vercel.com/ivan-martys-projects?repo=https://github.com/GodinesCrazy/ivan-reseller-web

---

## 🚀 CONFIGURACIÓN RÁPIDA EN VERCEL

### **Paso 1: Importar Proyecto**

1. Ve a: https://vercel.com/ivan-martys-projects?repo=https://github.com/GodinesCrazy/ivan-reseller-web
2. O ve a: https://vercel.com/new
3. Click **"Import Git Repository"**
4. Busca: `GodinesCrazy/ivan-reseller-web`
5. Click **"Import"**

---

### **Paso 2: Configurar Proyecto**

**Configuración del Framework:**
- ✅ **Framework Preset:** `Vite` (debería detectarse automáticamente)
- ✅ **Root Directory:** `frontend`
- ✅ **Build Command:** `npm run build`
- ✅ **Output Directory:** `dist`
- ✅ **Install Command:** `npm install`

**IMPORTANTE:** Asegúrate de que **Root Directory** esté configurado como `frontend`

---

### **Paso 3: Configurar Variables de Entorno**

En **"Environment Variables"** (antes de hacer deploy):

```env
VITE_API_URL=https://tu-backend-production.up.railway.app
```

**Reemplaza** `tu-backend-production.up.railway.app` con la URL real de Railway.

**Si aún no tienes Railway:**
- Deja el placeholder por ahora
- Después del deploy, puedes actualizar la variable y redesplegar

---

### **Paso 4: Deploy**

1. Click **"Deploy"**
2. Espera 2-3 minutos
3. Vercel te dará una URL como: `https://ivan-reseller-web-xxxx.vercel.app`

---

### **Paso 5: Configurar Dominio Personalizado**

1. En Vercel Dashboard → Tu Proyecto → **Settings** → **Domains**
2. Click **"Add"**
3. Ingresa: `ivanreseller.com`
4. Click **"Add"** nuevamente
5. Ingresa: `www.ivanreseller.com`
6. Vercel te dará records DNS

**Records DNS que Vercel te dará:**
```
Type: A
Name: @
Value: 76.76.21.21

Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

**Configurar en tu Proveedor DNS:**
1. Ve a tu panel DNS (Namecheap, GoDaddy, etc.)
2. Agrega los records que Vercel te dio
3. Espera 1-24 horas (propagación DNS)

---

## 🔄 ACTUALIZAR VARIABLES DESPUÉS DEL DEPLOYMENT

### **Si cambias la URL de Railway:**

1. Vercel Dashboard → Tu Proyecto → **Settings** → **Environment Variables**
2. Edita `VITE_API_URL`
3. Cambia a la nueva URL de Railway
4. Click **"Save"**
5. Vercel redesplegará automáticamente

---

## ✅ VERIFICACIÓN

### **1. Verificar que el Frontend carga:**
```
https://tu-proyecto.vercel.app
```
Debería mostrar la página de login.

### **2. Verificar que conecta con el Backend:**
- Abre la consola del navegador (F12)
- Ve a la pestaña "Network"
- Intenta hacer login
- Verifica que las peticiones a `/api/*` van a la URL correcta de Railway

---

## 🔧 CONFIGURACIÓN ADICIONAL

### **Headers de Seguridad:**
Vercel ya está configurado con `vercel.json` que incluye:
- ✅ X-Content-Type-Options
- ✅ X-Frame-Options
- ✅ X-XSS-Protection

### **Rewrites:**
El `vercel.json` también configura:
- ✅ Todas las rutas se redirigen a `/index.html` (SPA routing)

---

## 📋 CHECKLIST

- [ ] Proyecto importado en Vercel
- [ ] Root Directory configurado como `frontend`
- [ ] Build Command: `npm run build`
- [ ] Output Directory: `dist`
- [ ] Variable `VITE_API_URL` configurada
- [ ] Deploy exitoso
- [ ] Dominio configurado (opcional)
- [ ] DNS configurado (opcional)
- [ ] Verificación exitosa

---

## 🆘 TROUBLESHOOTING

### **Error: "Build failed"**
✅ Verifica que:
- Root Directory está como `frontend`
- Build Command es `npm run build`
- Todas las dependencias están en `frontend/package.json`

### **Error: "Cannot connect to API"**
✅ Verifica que:
- `VITE_API_URL` está configurada correctamente
- La URL de Railway es correcta
- El backend está corriendo en Railway

### **Error: "404 on routes"**
✅ Verifica que `vercel.json` tiene los rewrites configurados (ya está configurado)

---

## 📚 DOCUMENTACIÓN RELACIONADA

- `DEPLOYMENT_INMEDIATO.md` - Guía completa paso a paso
- `DEPLOYMENT_COMPLETO_PRODUCCION.md` - Guía detallada
- `GUIA_VARIABLES_ENTORNO.md` - Explicación de variables

---

**¡Listo para deployment en Vercel!** 🚀

