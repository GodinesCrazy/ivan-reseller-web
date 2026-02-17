# Despliegue en Railway - Ivan Reseller RC1

Resumen de despliegue en Railway.

## Servicios

1. **Backend** (Node.js)
   - Root: `backend`
   - Build: `npm ci && npm run build`
   - Start: `npm start` o `npx prisma migrate deploy && node dist/server.js`
   - Puerto: Railway inyecta PORT

2. **PostgreSQL** (Railway Plugin)
   - Variable `DATABASE_URL` inyectada automáticamente

3. **Frontend** (Vercel recomendado)
   - Root: `frontend`
   - Build: `npm run build`
   - Output: `dist`

## Variables de entorno (Backend)

| Variable | Descripción |
|----------|-------------|
| DATABASE_URL | PostgreSQL (Railway lo inyecta si usas el plugin) |
| REDIS_URL | Redis (opcional) |
| JWT_SECRET | Mínimo 32 caracteres |
| ENCRYPTION_KEY | Mínimo 32 caracteres |
| PAYPAL_CLIENT_ID | Producción |
| PAYPAL_CLIENT_SECRET | Producción |
| ALIEXPRESS_APP_KEY | AliExpress Affiliate |
| ALIEXPRESS_APP_SECRET | AliExpress Affiliate |
| CORS_ORIGIN | Orígenes permitidos (frontend URL) |
| NODE_ENV | production |
| AUTOPILOT_MODE | production o sandbox |

## Root Directory

En Railway: Settings ? Root Directory ? `backend`

## Health check

Railway usa `/health` o `/api/health` para health checks.

## Después de un push (deploy automático o manual)

- **Si el servicio está conectado a GitHub:** un `git push origin main` dispara el deploy automáticamente. Revisa en [Railway](https://railway.app) ? tu proyecto ? Deployments.

- **Para forzar deploy con CLI** (si no usas GitHub o quieres desplegar a mano):
  1. Una sola vez: `railway login` (se abre el navegador).
  2. Desde la raíz del repo:
     ```powershell
     .\scripts\deploy-backend-railway.ps1
     ```
  O desde `backend/`: `railway up`.
