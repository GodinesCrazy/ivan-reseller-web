# ⚡ Guía Rápida: Configurar Railway (Versión Simplificada)

## 🎯 Resumen en 5 Pasos

### 1️⃣ Obtener DATABASE_URL
- Ve a **Postgres** → **Variables**
- Busca `DATABASE_URL` o `DATABASE_PUBLIC_URL`
- Click en 👁️ → Click en 📋 → **COPIAR**

### 2️⃣ Obtener REDIS_URL
- Ve a **Redis** → **Variables**
- Busca `REDIS_URL`
- Click en 👁️ → Click en 📋 → **COPIAR**

### 3️⃣ Generar JWT_SECRET
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
**COPIAR** el resultado (64 caracteres)

### 4️⃣ Configurar en ivan-reseller-web
- Ve a **ivan-reseller-web** → **Variables**
- Click en **"+ New Variable"** para cada una:

| Variable | Valor |
|----------|-------|
| `DATABASE_URL` | (Pegar del paso 1) |
| `REDIS_URL` | (Pegar del paso 2) |
| `JWT_SECRET` | (Pegar del paso 3) |
| `NODE_ENV` | `production` |
| `API_URL` | `https://ivan-reseller-web-production.up.railway.app` |
| `CORS_ORIGIN` | `https://tu-frontend.railway.app` |

### 5️⃣ Deployment
- **Opción A:** Push a GitHub (deployment automático)
- **Opción B:** Click en **"Redeploy"** en Railway

---

## ✅ Verificar

1. **Health Check:** `https://tu-url.railway.app/health`
2. **Logs:** Railway → Deployments → View logs
3. **Buscar:** `✅ Database connected`, `✅ Redis connected`

---

## 🚨 Problemas Comunes

| Error | Solución |
|-------|----------|
| DATABASE_URL no encontrada | Verificar que existe y empiece con `postgresql://` |
| Redis connection failed | Verificar que `REDIS_URL` existe y empiece con `redis://` |
| JWT_SECRET muy corto | Generar nuevo con el comando (64 caracteres) |

---

¡Listo! 🚀

