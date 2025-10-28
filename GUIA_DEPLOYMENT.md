# Instrucciones de Deployment - Ivan Reseller Web

## 🚀 Deployment en Railway (Recomendado)

### Pre-requisitos
- Cuenta en Railway.app (gratis)
- Cuenta en GitHub
- Código en repositorio GitHub

### Paso 1: Preparar el Proyecto

1. **Crear archivo de configuración para Railway:**

```powershell
# En la raíz del proyecto
cd C:\Ivan_Reseller_Web
```

2. **Asegurarse de que .gitignore esté correcto:**
```
node_modules/
.env
dist/
*.log
.DS_Store
```

3. **Commit y push a GitHub:**
```powershell
git init
git add .
git commit -m "Initial commit - Ivan Reseller Web"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/ivan_reseller_web.git
git push -u origin main
```

### Paso 2: Deploy Backend en Railway

1. Ve a https://railway.app
2. Click en "Start a New Project"
3. Selecciona "Deploy from GitHub repo"
4. Autoriza Railway en GitHub
5. Selecciona tu repositorio `ivan_reseller_web`
6. Railway detecta automáticamente Node.js

**Configurar Variables de Entorno en Railway:**
```
NODE_ENV=production
PORT=3000
JWT_SECRET=tu-secreto-super-seguro-de-minimo-32-caracteres-aqui
DATABASE_URL=[Railway lo genera automáticamente]
REDIS_URL=[Railway lo genera automáticamente]
CORS_ORIGIN=https://tu-frontend.vercel.app
```

**Railway Command Override:**
- Build Command: `cd backend && npm install && npx prisma generate`
- Start Command: `cd backend && npm run start`

7. Railway te dará una URL: `https://tu-backend.up.railway.app`

### Paso 3: Agregar PostgreSQL en Railway

1. En tu proyecto de Railway, click en "New"
2. Selecciona "Database" → "PostgreSQL"
3. Railway conecta automáticamente el DATABASE_URL
4. Ejecutar migraciones:
   - En Railway, ve a tu servicio backend
   - Settings → Deploy Hooks
   - Añadir comando: `npx prisma migrate deploy`

### Paso 4: Deploy Frontend en Vercel

1. Ve a https://vercel.com
2. Click en "Add New" → "Project"
3. Importa tu repositorio de GitHub
4. Configura:
   - Framework Preset: Vite
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

**Variables de Entorno en Vercel:**
```
VITE_API_URL=https://tu-backend.up.railway.app
```

5. Click en "Deploy"
6. Vercel te dará: `https://ivan-reseller.vercel.app`

### Paso 5: Actualizar CORS en Backend

Vuelve a Railway y actualiza la variable `CORS_ORIGIN`:
```
CORS_ORIGIN=https://ivan-reseller.vercel.app
```

### Paso 6: Ejecutar Seed de Datos

En Railway:
1. Ve a tu servicio backend
2. Click en "Settings" → "Variables"
3. Añade comando personalizado o usa Railway CLI:

```powershell
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link al proyecto
railway link

# Ejecutar seed
railway run npm run prisma:seed
```

---

## 🌍 URLs Finales

Después del deployment:
- **Frontend:** https://ivan-reseller.vercel.app
- **Backend API:** https://ivan-reseller-backend.up.railway.app
- **Database:** Gestionada por Railway (privada)
- **Redis:** Gestionado por Railway (privado)

---

## 🔐 Seguridad Post-Deployment

1. **Cambiar JWT_SECRET** a un valor fuerte y único
2. **Habilitar HTTPS** (Railway y Vercel lo hacen automáticamente)
3. **Rate Limiting** ya está configurado en el código
4. **Variables de entorno** nunca en el código

---

## 💰 Costos Estimados

### Railway (Backend + PostgreSQL + Redis)
- **Free Tier:** $5 de crédito mensual gratis
- **Hobby:** $5/mes para uso personal
- **Pro:** $20/mes para producción

### Vercel (Frontend)
- **Free:** Ilimitado para proyectos personales
- **Pro:** $20/mes para equipos

### Total Inicial: **$0/mes** (usando free tiers)

---

## 📊 Alternativa: Todo en Render.com

Si prefieres un solo proveedor:

1. Ve a https://render.com
2. New → Web Service → Conectar GitHub
3. Render detecta automáticamente Node.js y React
4. Crear PostgreSQL Database (gratis)
5. Conectar servicios

**Costos Render:**
- Free tier disponible
- Web Services se duermen después de 15min sin uso
- Primer request tarda ~30s en despertar

---

## 🚨 Troubleshooting Deployment

### Error: "Cannot connect to database"
- Verifica que DATABASE_URL esté configurado
- Ejecuta migraciones: `railway run npx prisma migrate deploy`

### Error: "CORS policy blocked"
- Actualiza CORS_ORIGIN en Railway con tu URL de Vercel

### Error: "Build failed"
- Verifica que package.json tenga todos los scripts
- Revisa logs en Railway/Vercel

### Frontend no puede conectar al backend
- Actualiza VITE_API_URL en Vercel
- Verifica que la URL del backend sea correcta

---

## 📱 Compartir con el Mundo

Una vez deployado, cualquier persona puede acceder con:

```
https://ivan-reseller.vercel.app

Login con:
- Usuario: demo
- Contraseña: demo123
```

**Crear nuevos usuarios:**
Los usuarios pueden registrarse en `/login` o el admin puede crearlos desde `/users`

---

## 🔄 CI/CD Automático

Una vez configurado:
1. Haces cambios en tu código local
2. `git push` a GitHub
3. Railway y Vercel detectan el push
4. Automáticamente rebuildan y deployean
5. Sitio actualizado en ~2-5 minutos

---

## 🎯 Siguiente Nivel: Dominio Propio

### Comprar Dominio
- Namecheap: ~$10/año
- GoDaddy: ~$12/año
- Google Domains: ~$12/año

### Configurar DNS
En tu proveedor de dominio, añade:
```
A Record:
@ → Vercel IP (te lo da Vercel)

CNAME Record:
www → cname.vercel-dns.com
api → tu-backend.up.railway.app
```

### Resultado Final
```
https://ivanreseller.com       ← Frontend
https://api.ivanreseller.com   ← Backend API
```

---

**¿Listo para deployar? Avísame y te guío paso a paso.** 🚀
