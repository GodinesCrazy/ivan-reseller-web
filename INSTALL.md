# Instalación - Ivan Reseller RC1

Guía de instalación para entornos locales y servidores.

## Prerrequisitos

- Node.js 20+
- PostgreSQL 14+
- Redis 6+ (opcional, usa localhost por defecto)
- Git

## Variables de entorno mínimas

Copia `backend/env.local.example` a `backend/.env.local` y completa:

| Variable | Requerido | Descripción |
|----------|-----------|-------------|
| DATABASE_URL | Sí | URL PostgreSQL |
| JWT_SECRET | Sí | Mínimo 32 caracteres |
| ENCRYPTION_KEY | Sí | Mínimo 32 caracteres |
| PAYPAL_CLIENT_ID | Producción | Para dual payout |
| PAYPAL_CLIENT_SECRET | Producción | Para dual payout |
| ALIEXPRESS_APP_KEY | Sí | AliExpress Affiliate |
| ALIEXPRESS_APP_SECRET | Sí | AliExpress Affiliate |
| INTERNAL_RUN_SECRET | Sí | Para endpoints internos |

## Pasos

### Backend

```bash
cd backend
npm install
npx prisma migrate deploy
npm run build
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run build
```

Para desarrollo local: `npm run dev` en backend y frontend por separado.

## Verificación

- Backend: http://localhost:4000/api/health
- Frontend: http://localhost:5173

## Release check

```bash
npm run release-check
```

Requiere backend en ejecución y variables configuradas. Exit 0 si todo pasa.
