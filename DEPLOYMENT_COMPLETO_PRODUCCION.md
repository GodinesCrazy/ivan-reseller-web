# 🚀 GUÍA COMPLETA DE DEPLOYMENT A PRODUCCIÓN - www.ivanreseller.com

**Fecha:** ${new Date().toISOString().split('T')[0]}  
**Objetivo:** Subir el sistema completo a producción en www.ivanreseller.com

---

## 📋 RESUMEN: ¿QUÉ SON LAS VARIABLES DE ENTORNO?

**Variables de entorno** son configuraciones secretas o específicas del entorno que el sistema necesita para funcionar. Son como "configuraciones" que cambian según el ambiente (desarrollo vs producción).

**Ejemplos:**
- `DATABASE_URL` = URL de la base de datos (diferente en desarrollo vs producción)
- `JWT_SECRET` = Clave secreta para tokens (debe ser única y segura)
- `PAYPAL_CLIENT_ID` = Tu ID de PayPal (para pagos reales)

**¿Por qué no están en el código?**
- Son secretos (no deben estar en GitHub)
- Cambian según el entorno (local vs producción)
- Son diferentes para cada instalación

**Archivos creados:**
- `backend/.env.example` - Plantilla con todas las variables necesarias
- `frontend/.env.example` - Plantilla para frontend

---

## 🎯 PREPARACIÓN PARA DEPLOYMENT

### **Paso 1: Verificar Código Local**

```bash
# Asegúrate de que todo funciona localmente
cd backend
npm install
npm run build
npm start

# En otra terminal
cd frontend
npm install
npm run build
```

### **Paso 2: Commit y Push a GitHub**

```bash
git add .
git commit -m "feat: Implementación completa de mejoras prioritarias"
git push origin main
```

---

## 🌐 OPCIÓN A: DEPLOYMENT EN RAILWAY + VERCEL (RECOMENDADO)

### **A.1: Configurar Railway (Backend)**

1. **Ir a:** https://railway.app
2. **Login con GitHub**
3. **New Project** → **Deploy from GitHub repo**
4. **Seleccionar:** Tu repositorio

**Configuración del Servicio:**
- **Root Directory:** `backend`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

**Agregar PostgreSQL:**
- Click **"+ New"** → **"Database"** → **"PostgreSQL"**
- Railway crea automáticamente `DATABASE_URL`

**Agregar Redis (opcional pero recomendado):**
- Click **"+ New"** → **"Database"** → **"Redis"**
- Railway crea automáticamente `REDIS_URL`

**Variables de Entorno en Railway:**
Click en servicio backend → **"Variables"** → Agregar:

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=[GENERA UNO SEGURO - VER ABAJO]
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
LOG_LEVEL=info

# PayPal (si tienes credenciales)
PAYPAL_CLIENT_ID=tu_client_id
PAYPAL_CLIENT_SECRET=tu_client_secret
PAYPAL_ENVIRONMENT=production

# Redis (si agregaste Redis)
REDIS_URL=[Se crea automáticamente]

# DATABASE_URL se crea automáticamente cuando agregas PostgreSQL
```

**Generar JWT_SECRET seguro:**
```bash
# En tu terminal local:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Obtener URL del Backend:**
- Railway → Settings → Networking → **Generate Domain**
- Copia la URL: `https://tu-backend-production.up.railway.app`

---

### **A.2: Configurar Vercel (Frontend)**

1. **Ir a:** https://vercel.com
2. **Login con GitHub**
3. **Add New...** → **Project**
4. **Import** tu repositorio

**Configuración:**
- **Framework Preset:** Vite
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

**Variables de Entorno en Vercel:**
En **"Environment Variables"**:

```env
VITE_API_URL=https://tu-backend-production.up.railway.app
```

**Reemplaza** `tu-backend-production.up.railway.app` con la URL real de Railway.

**Deploy:**
- Click **"Deploy"**
- Vercel te dará: `https://ivan-reseller-xxxx.vercel.app`

---

### **A.3: Configurar Dominio www.ivanreseller.com**

#### **En Vercel (Frontend):**

1. Dashboard → Tu Proyecto → **Settings** → **Domains**
2. Agregar: `ivanreseller.com` y `www.ivanreseller.com`
3. Vercel te dará records DNS:
   ```
   Type: A
   Name: @
   Value: 76.76.21.21
   
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```

#### **En tu Proveedor de Dominio (Namecheap, GoDaddy, etc.):**

1. Ve a tu panel de DNS
2. Agregar los records que Vercel te dio
3. Esperar 1-24 horas (propagación DNS)

#### **Subdominio para API (Opcional):**

Si quieres `api.ivanreseller.com` para el backend:

1. En tu proveedor DNS:
   ```
   Type: CNAME
   Name: api
   Value: tu-backend-production.up.railway.app
   ```

2. Actualizar `CORS_ORIGIN` en Railway:
   ```env
   CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,https://api.ivanreseller.com
   ```

---

## 🌐 OPCIÓN B: DEPLOYMENT EN UN SERVIDOR VPS (DIGITALOCEAN, AWS, ETC.)

Si prefieres tener todo en un servidor propio:

### **B.1: Preparar Servidor**

```bash
# Instalar Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Instalar Redis
sudo apt-get install redis-server

# Instalar Nginx
sudo apt-get install nginx

# Instalar PM2 (para mantener procesos corriendo)
sudo npm install -g pm2
```

### **B.2: Clonar Repositorio**

```bash
cd /var/www
sudo git clone https://github.com/tu-usuario/ivan-reseller-web.git
cd ivan-reseller-web
```

### **B.3: Configurar Base de Datos**

```bash
# Crear base de datos
sudo -u postgres psql
CREATE DATABASE ivan_reseller;
CREATE USER ivan_user WITH PASSWORD 'tu_password_seguro';
GRANT ALL PRIVILEGES ON DATABASE ivan_reseller TO ivan_user;
\q

# Configurar DATABASE_URL en .env
```

### **B.4: Configurar Backend**

```bash
cd backend
npm install
npm run build

# Crear archivo .env
cp .env.example .env
nano .env  # Editar con tus valores
```

**Contenido de `.env`:**
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://ivan_user:tu_password@localhost:5432/ivan_reseller
REDIS_URL=redis://localhost:6379
JWT_SECRET=[genera uno seguro]
CORS_ORIGIN=https://www.ivanreseller.com
```

### **B.5: Ejecutar Migraciones**

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

### **B.6: Iniciar con PM2**

```bash
cd backend
pm2 start dist/server.js --name "ivan-reseller-backend"
pm2 save
pm2 startup  # Seguir instrucciones
```

### **B.7: Configurar Nginx (Reverse Proxy)**

Crear `/etc/nginx/sites-available/ivanreseller`:

```nginx
# Backend API
server {
    listen 80;
    server_name api.ivanreseller.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend
server {
    listen 80;
    server_name www.ivanreseller.com ivanreseller.com;

    root /var/www/ivan-reseller-web/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ivanreseller /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### **B.8: Configurar SSL (HTTPS)**

```bash
# Instalar Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtener certificados SSL
sudo certbot --nginx -d ivanreseller.com -d www.ivanreseller.com -d api.ivanreseller.com
```

---

## ✅ CHECKLIST PRE-DEPLOYMENT

### **Código:**
- [x] Todas las mejoras implementadas
- [ ] Código probado localmente
- [ ] Sin errores de linting
- [ ] Build exitoso (backend y frontend)

### **Base de Datos:**
- [ ] PostgreSQL configurado
- [ ] Migraciones ejecutadas
- [ ] Seed ejecutado (opcional, para datos de prueba)

### **Variables de Entorno:**
- [ ] `JWT_SECRET` generado y configurado
- [ ] `DATABASE_URL` configurado
- [ ] `CORS_ORIGIN` configurado con dominio real
- [ ] `PAYPAL_*` configurado (si usas PayPal)
- [ ] `REDIS_URL` configurado (si usas Redis)

### **Dominio:**
- [ ] Dominio comprado y configurado
- [ ] DNS configurado correctamente
- [ ] SSL/HTTPS configurado

### **APIs Externas (Opcional):**
- [ ] PayPal configurado (para pagos)
- [ ] eBay API (si usas eBay)
- [ ] MercadoLibre API (si usas ML)
- [ ] Groq API (para IA)

---

## 🔧 CONFIGURACIÓN ESPECÍFICA PARA www.ivanreseller.com

### **1. Variables de Entorno en Producción:**

**Backend (Railway o VPS):**
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=[auto-generado por Railway o configurado manualmente]
REDIS_URL=[auto-generado por Railway o redis://localhost:6379]
JWT_SECRET=[genera uno seguro de 32+ caracteres]
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com
LOG_LEVEL=info
PAYPAL_CLIENT_ID=[tu_client_id]
PAYPAL_CLIENT_SECRET=[tu_client_secret]
PAYPAL_ENVIRONMENT=production
```

**Frontend (Vercel o VPS):**
```env
VITE_API_URL=https://api.ivanreseller.com
# O si usas Railway directamente:
# VITE_API_URL=https://tu-backend-production.up.railway.app
```

### **2. Actualizar CORS después del primer deploy:**

Una vez que tengas la URL de Vercel, actualiza `CORS_ORIGIN` en Railway:

```env
CORS_ORIGIN=https://www.ivanreseller.com,https://ivanreseller.com,https://ivan-reseller-xxxx.vercel.app
```

---

## 🧪 TESTING POST-DEPLOYMENT

### **Checklist de Verificación:**

1. **Frontend carga:**
   - [ ] Abrir https://www.ivanreseller.com
   - [ ] Ver página de login
   - [ ] Sin errores en consola

2. **Backend responde:**
   - [ ] Abrir https://api.ivanreseller.com/health
   - [ ] Debe responder: `{"status":"ok"}`

3. **Login funciona:**
   - [ ] Probar login con credenciales de seed
   - [ ] Dashboard carga correctamente

4. **APIs funcionan:**
   - [ ] Crear producto
   - [ ] Ver reportes
   - [ ] Notificaciones funcionan

5. **Cron Jobs funcionan:**
   - [ ] Verificar logs en Railway
   - [ ] Cron jobs ejecutándose correctamente

---

## 📊 MONITOREO Y MANTENIMIENTO

### **Railway:**
- **Logs:** Dashboard → Tu servicio → Deployments → Ver logs
- **Métricas:** CPU, RAM, Network en dashboard
- **Alertas:** Configurar alertas de uso

### **Vercel:**
- **Analytics:** Dashboard → Analytics
- **Logs:** Deployments → Ver logs de build
- **Performance:** Web Vitals en Analytics

---

## 🔄 ACTUALIZACIONES FUTURAS

Cada vez que hagas cambios:

```bash
# 1. Hacer cambios localmente
# 2. Probar localmente
# 3. Commit y push
git add .
git commit -m "feat: Descripción de cambios"
git push origin main

# 4. Railway y Vercel hacen deploy automático
# 5. Verificar en producción después de 2-5 minutos
```

---

## 🆘 TROUBLESHOOTING COMÚN

### **Error: "Cannot connect to API"**
**Solución:**
1. Verificar `VITE_API_URL` en Vercel
2. Verificar `CORS_ORIGIN` en Railway incluye tu dominio
3. Verificar que backend está corriendo (Railway dashboard)

### **Error: "Database connection failed"**
**Solución:**
1. Verificar `DATABASE_URL` en Railway
2. Verificar que PostgreSQL está running
3. Ejecutar migraciones: `npx prisma migrate deploy`

### **Error: "JWT_SECRET must be at least 32 characters"**
**Solución:**
1. Generar nuevo secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Actualizar en Railway → Variables

### **Error: "CORS policy blocked"**
**Solución:**
1. Agregar tu dominio exacto a `CORS_ORIGIN`
2. Incluir `https://` y `www.` si es necesario
3. Redesployar backend

---

## 💰 COSTOS ESTIMADOS

### **Opción A: Railway + Vercel**
- **Railway:** $5/mes (Hobby plan) - $5 crédito gratis/mes
- **Vercel:** GRATIS (hasta 100GB bandwidth)
- **Total:** $0-5/mes

### **Opción B: VPS**
- **DigitalOcean Droplet:** $6-12/mes
- **Dominio:** $10-15/año
- **Total:** ~$7-15/mes

---

## ✅ CHECKLIST FINAL ANTES DE SUBIR A PRODUCCIÓN

### **Código:**
- [x] Todas las mejoras implementadas
- [ ] Tests locales pasan
- [ ] Build exitoso sin errores
- [ ] Código commiteado y pusheado a GitHub

### **Configuración:**
- [ ] Variables de entorno configuradas
- [ ] JWT_SECRET generado y seguro
- [ ] CORS_ORIGIN configurado correctamente
- [ ] DATABASE_URL configurado

### **Deployment:**
- [ ] Railway/VPS configurado
- [ ] Vercel/VPS configurado
- [ ] Dominio configurado
- [ ] SSL/HTTPS configurado

### **Verificación:**
- [ ] Frontend carga correctamente
- [ ] Backend responde
- [ ] Login funciona
- [ ] APIs funcionan
- [ ] Cron jobs funcionan

---

## 🎯 PRÓXIMOS PASOS DESPUÉS DEL DEPLOYMENT

1. **Configurar PayPal** (si quieres pagos reales)
2. **Configurar APIs de Marketplaces** (eBay, MercadoLibre, Amazon)
3. **Configurar monitoreo** (Sentry, LogRocket)
4. **Configurar backups** automáticos de base de datos
5. **Optimizar performance** (caching, CDN)

---

**¿Listo para deployment?** Sigue los pasos de la sección que elijas (Railway+Vercel o VPS) y avísame si necesitas ayuda en algún paso específico.

