# 🚀 Deployment en Vercel - Ivan Reseller Frontend

**Guía completa para desplegar el frontend de Ivan Reseller en Vercel**

**Última actualización:** 2025-01-27  
**Versión:** 1.0

---

## 📋 Prerrequisitos

- Cuenta en [Vercel](https://vercel.com)
- Repositorio Git conectado (GitHub, GitLab, etc.)
- Backend desplegado en Railway (o tu proveedor preferido)
- URL del backend disponible

---

## 🏗️ Arquitectura

### Servicios

1. **Frontend (Vercel)**
   - Framework: Vite + React
   - Base de código: `frontend/`
   - Build output: `frontend/dist`

2. **Backend (Railway)**
   - URL ejemplo: `https://ivan-reseller-web-production.up.railway.app`
   - API base: `/api`

---

## 📦 Paso 1: Importar Proyecto en Vercel

1. Ve a [Vercel Dashboard](https://vercel.com/dashboard)
2. Click en **"Add New..."** → **"Project"**
3. Selecciona tu repositorio: `GodinesCrazy/ivan-reseller-web`
4. Click **"Import"**

---

## 🔧 Paso 2: Configurar Build Settings

Vercel debería detectar automáticamente Vite, pero verifica:

- **Framework Preset:** `Vite` (o `Other`)
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm ci --include=dev`

---

## 🔐 Paso 3: Configurar Variables de Entorno

### Opción A: Con VITE_API_URL (Recomendado)

1. En Vercel Dashboard → Tu Proyecto → **Settings** → **Environment Variables**
2. Agrega las siguientes variables:

```env
VITE_API_URL=https://ivan-reseller-web-production.up.railway.app
```

**Importante:**
- Reemplaza `ivan-reseller-web-production.up.railway.app` con tu URL real de Railway
- **NO** incluyas trailing slash (`/`) al final
- Selecciona los scopes: **Production**, **Preview**, y **Development**

### Opción B: Sin VITE_API_URL (Usando Proxy) - **RECOMENDADO**

Si no configuras `VITE_API_URL`, el frontend usará `/api` como fallback y Vercel lo redirigirá al backend mediante `vercel.json`.

**Ventaja:** No necesitas configurar variables de entorno, evita problemas de CORS  
**Desventaja:** Depende de que `vercel.json` tenga la URL correcta del backend

**Nota:** En producción, el sistema usa automáticamente `/api` como proxy, por lo que no necesitas configurar `VITE_API_URL` a menos que quieras usar una URL absoluta específica.

### Variables Opcionales

#### VITE_ENABLE_INVESTOR_DOCS
- **Tipo:** Boolean (string: `'true'` o `'false'`)
- **Default:** `'false'`
- **Descripción:** Habilita documentación para inversionistas (solo accesible para administradores)
- **Cuándo usar:** Solo si necesitas mostrar documentación de inversionistas en `/help/investors`
- **Ejemplo:** `VITE_ENABLE_INVESTOR_DOCS=true`

#### VITE_LOG_LEVEL
- **Tipo:** String
- **Default:** `'warn'`
- **Descripción:** Nivel de logging del frontend (controla qué mensajes aparecen en consola)
- **Valores:** `'error'`, `'warn'`, `'info'`, `'debug'`
- **Ejemplo:** `VITE_LOG_LEVEL=warn`

---

## 📝 Paso 4: Verificar vercel.json

El archivo `vercel.json` en la raíz del proyecto debe tener:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://tu-backend.railway.app/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Asegúrate de actualizar la URL del backend en `vercel.json` si usas la Opción B.**

---

## 🚀 Paso 5: Deploy

1. Click en **"Deploy"**
2. Espera 2-4 minutos mientras Vercel:
   - Instala dependencias
   - Ejecuta `npm run build`
   - Despliega los archivos estáticos
3. Verifica que el build sea exitoso (verde)
4. Click en **"Visit"** para ver el sitio

---

## ✅ Paso 6: Verificar Deployment

### 1. Verificar que el sitio carga

- Abre la URL de Vercel (ej: `https://ivan-reseller-web.vercel.app`)
- Deberías ver la página de login

### 2. Verificar conexión con backend

- Abre DevTools → Network
- Intenta hacer login
- Verifica que las peticiones a `/api/*` funcionen

### 3. Verificar ErrorBanner

- **En producción:** El banner NO debería aparecer si usas el proxy `/api` (comportamiento esperado)
- El banner solo aparece si hay un error real de configuración
- El banner es cerrable y no bloquea la UI

---

## 🔄 Paso 7: Configurar CORS en Railway

Después de tener la URL de Vercel:

1. Ve a Railway Dashboard → Tu servicio backend → **Variables**
2. Encuentra `CORS_ORIGIN`
3. Agrega la URL de Vercel:

```env
CORS_ORIGIN=https://tu-proyecto.vercel.app,https://www.ivanreseller.com
```

4. Railway se redesplegará automáticamente

---

## 🛠️ Troubleshooting

### Error: "VITE_API_URL no está configurada"

**Solución:**
- Opción 1: Configura `VITE_API_URL` en Vercel (Settings → Environment Variables)
- Opción 2: Verifica que `vercel.json` tenga el rewrite correcto para `/api`

### Error: "Cannot connect to API"

**Causas posibles:**
1. Backend no está corriendo en Railway
2. CORS no está configurado correctamente
3. URL del backend incorrecta

**Solución:**
1. Verifica que el backend responda: `https://tu-backend.railway.app/health`
2. Verifica `CORS_ORIGIN` en Railway incluye tu URL de Vercel
3. Verifica que `VITE_API_URL` o `vercel.json` tengan la URL correcta

### Error: "Build Failed"

**Causas posibles:**
1. Dependencias faltantes
2. Errores de TypeScript
3. Archivos faltantes en git

**Solución:**
1. Ejecuta `npm ci --include=dev` localmente
2. Ejecuta `npm run build` localmente para ver errores
3. Verifica que todos los archivos estén en git (`git status`)

### Banner de error siempre visible

**Solución:**
- En producción, el banner NO aparece cuando usas `/api` (es el comportamiento esperado)
- El banner solo aparece si hay un error real de configuración
- Si el banner aparece, verifica que no haya errores en la configuración de `VITE_API_URL`

---

## 📚 Referencias

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html#vercel)
- [Railway Deployment Guide](./DEPLOYMENT_RAILWAY.md)

---

## ✅ Checklist Final

- [ ] Proyecto importado en Vercel
- [ ] Build settings configurados correctamente
- [ ] Variables de entorno configuradas (si aplica)
- [ ] `vercel.json` actualizado con URL del backend
- [ ] Deploy exitoso
- [ ] Sitio carga correctamente
- [ ] Conexión con backend funciona
- [ ] CORS configurado en Railway
- [ ] Banner de error no bloquea la UI (o está cerrado)

---

**¿Problemas?** Revisa los logs de Vercel y Railway, y consulta la sección de Troubleshooting.

