# ?? Railway Backend Deployment - Resumen Ejecutivo

**Versión:** 1.0.0  
**Última actualización:** 2025-01-23

---

## ?? Objetivo

Desplegar backend en Railway como servicio separado para que los endpoints `/api/*` funcionen.

---

## ? Quick Start (5 minutos)

### 1. Crear Servicio Backend

Railway ? "+ New" ? GitHub Repo ? `GodinesCrazy/ivan-reseller-web`

**Settings:**
- Root Directory: `backend`
- Build Command: `npm ci && npx prisma generate && npm run build`
- Start Command: `npm start`

---

### 2. Variables Backend

Railway ? Backend ? Variables ? A?adir:

```
DATABASE_URL = (de PostgreSQL service)
JWT_SECRET = (generar: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY = (generar: mismo comando, valor diferente)
NODE_ENV = production
CORS_ORIGIN = https://ivanreseller.com
FRONTEND_URL = https://ivanreseller.com
REDIS_URL = (de Redis service, opcional)
```

**Eliminar (si existen):**
- `FORCE_ROUTING_OK`
- `SAFE_BOOT` (o poner `false`)

---

### 3. Obtener Dominio

Railway ? Backend ? Settings ? Networking ? Generate Domain

**Copiar dominio:** `https://<servicio>.up.railway.app`

---

### 4. Actualizar vercel.json

Editar `vercel.json` líneas 10, 14, 18:

**Reemplazar:** `ivan-reseller-web-production.up.railway.app`  
**Por:** `<TU_DOMINIO_BACKEND>.up.railway.app`

**Commit y push:**
```bash
git add vercel.json
git commit -m "fix: update Vercel proxy to backend service"
git push origin main
```

---

### 5. Validar

```bash
# Health
curl https://<BACKEND>/health

# Auth (sin token)
curl https://<BACKEND>/api/auth/me

# Login
curl -X POST https://<BACKEND>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

---

## ?? Comandos Build/Start

### Backend

**Build:** `npm ci && npx prisma generate && npm run build`  
**Start:** `npm start`

**Evidencia:** `backend/package.json:8,10`

---

### Frontend

**Build:** `cd frontend && npm ci && npm run build`  
**Start:** (estático, no necesita)

---

## ?? Variables Requeridas

### Backend (Railway)

| Variable | Valor | Fuente |
|----------|-------|--------|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL service |
| `JWT_SECRET` | `a1b2c3...` (32+ chars) | Generar |
| `ENCRYPTION_KEY` | `z9y8x7...` (32+ chars) | Generar |
| `NODE_ENV` | `production` | |
| `CORS_ORIGIN` | `https://ivanreseller.com` | |
| `FRONTEND_URL` | `https://ivanreseller.com` | |
| `REDIS_URL` | `redis://...` | Redis service (opcional) |
| `PORT` | (Railway lo inyecta) | NO configurar |

---

## ? Checklist de Pruebas

- [ ] `GET /health` ? 200 OK
- [ ] `GET /api/auth/me` (sin token) ? 401 (no 502)
- [ ] `POST /api/auth/login` ? 200 con token
- [ ] `GET /api/auth/me` (con token) ? 200 con usuario
- [ ] `GET /api/debug/aliexpress/test-search` (con token) ? OK o NO_CREDENTIALS

---

## ?? Archivos Modificados

1. `vercel.json` - Actualizar destino de proxy a nuevo dominio backend
2. `docs/RAILWAY_DEPLOYMENT_BACKEND.md` - Guía completa
3. `docs/RAILWAY_DEPLOYMENT_CHECKLIST.md` - Checklist
4. `docs/RAILWAY_DEPLOYMENT_INSTRUCTIONS.md` - Instrucciones paso a paso
5. `docs/RAILWAY_DEPLOYMENT_SUMMARY.md` - Este resumen

---

## ?? Troubleshooting Rápido

**502 Bad Gateway:**
- Backend no desplegado ? Verificar Railway ? Deployments
- Variables faltantes ? Verificar `JWT_SECRET`, `DATABASE_URL`
- Logs ? Railway ? Deployments ? Latest ? View Logs

**CORS Error:**
- `CORS_ORIGIN` no configurado ? A?adir `CORS_ORIGIN=https://ivanreseller.com`

**Database Error:**
- `DATABASE_URL` incorrecta ? Copiar de PostgreSQL service ? Variables

---

## ?? Documentación Completa

- **Guía completa:** `docs/RAILWAY_DEPLOYMENT_BACKEND.md`
- **Checklist:** `docs/RAILWAY_DEPLOYMENT_CHECKLIST.md`
- **Instrucciones paso a paso:** `docs/RAILWAY_DEPLOYMENT_INSTRUCTIONS.md`
- **Variables de entorno:** `docs/RAILWAY_ENV_VARS.md`

---

**Tiempo estimado total:** 15-20 minutos
