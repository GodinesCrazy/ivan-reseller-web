# 📸 FASE 0: SNAPSHOT Y PREPARACIÓN

**Fecha:** 2025-01-28  
**Tipo:** Auditoría 360° Production-Ready  
**Estado:** ✅ COMPLETADO

---

## 📋 ÍNDICE

1. [Estructura del Proyecto](#estructura-del-proyecto)
2. [Stack Tecnológico](#stack-tecnológico)
3. [Scripts NPM](#scripts-npm)
4. [Rutas Principales y Entrypoints](#rutas-principales-y-entrypoints)
5. [Configuración de Entorno](#configuración-de-entorno)
6. [Estado Git](#estado-git)

---

## 📁 ESTRUCTURA DEL PROYECTO

```
Ivan_Reseller_Web/
├── backend/                 # API Node.js + Express + TypeScript
│   ├── src/
│   │   ├── api/
│   │   │   └── routes/      # 50 archivos de rutas API
│   │   ├── services/        # 93 archivos de servicios
│   │   ├── middleware/      # 10 middlewares (auth, error, correlation, etc.)
│   │   ├── config/          # Configuración (env, db, redis, logger, swagger)
│   │   ├── jobs/            # Trabajos en background (BullMQ)
│   │   └── utils/           # Utilidades (21 archivos)
│   ├── prisma/
│   │   ├── schema.prisma    # Schema de base de datos
│   │   └── migrations/      # 16 migraciones SQL
│   ├── dist/                # Código compilado
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.js
│
├── frontend/                # React + TypeScript + Vite
│   ├── src/
│   │   ├── pages/           # 25+ páginas
│   │   ├── components/      # Componentes React
│   │   ├── services/        # API clients (axios)
│   │   ├── stores/          # Zustand stores
│   │   ├── hooks/           # React hooks personalizados
│   │   └── content/docs/    # Documentación markdown
│   ├── dist/                # Build de producción
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── docs/                    # Documentación
│   ├── audit/               # 🆕 Carpeta de auditoría (este documento)
│   ├── help/                # Help in-app
│   └── investors/           # Docs para inversionistas
│
├── scripts/                 # Scripts de utilidad
└── package.json             # Root package.json
```

---

## 🛠️ STACK TECNOLÓGICO

### Backend

- **Runtime:** Node.js >= 20.0.0
- **Framework:** Express.js 4.18.2
- **Lenguaje:** TypeScript 5.9.3
- **ORM:** Prisma 5.7.0
- **Base de Datos:** PostgreSQL (Railway)
- **Cache/Sessions:** Redis (opcional, fallback localhost)
- **Queue Jobs:** BullMQ 5.1.0 (requiere Redis)
- **Auth:** JWT (jsonwebtoken 9.0.2) + bcrypt 5.1.1
- **Validation:** Zod 3.22.4
- **Security:**
  - Helmet 7.1.0 (headers security)
  - express-rate-limit 8.2.1 (rate limiting)
  - cookie-parser 1.4.7
- **Logging:** Winston 3.11.0
- **HTTP Client:** Axios 1.6.2
- **Real-time:** Socket.io 4.6.0
- **Scraping:** Puppeteer 24.28.0 + puppeteer-extra
- **API Docs:** Swagger (swagger-jsdoc + swagger-ui-express)

### Frontend

- **Framework:** React 18.2.0
- **Build Tool:** Vite 5.0.8
- **Lenguaje:** TypeScript 5.2.2
- **Styling:** TailwindCSS 3.3.6
- **State Management:** Zustand 4.4.7
- **Server State:** @tanstack/react-query 5.13.4
- **Routing:** React Router 6.20.1
- **Forms:** React Hook Form 7.49.2 + Zod
- **HTTP Client:** Axios 1.6.2
- **Markdown:** react-markdown 10.1.0 + remark-gfm
- **Icons:** Lucide React 0.294.0
- **Charts:** Recharts 2.10.3
- **Notifications:** react-hot-toast 2.4.1 + sonner 1.2.0

### Infraestructura

- **Deployment Backend:** Railway
- **Deployment Frontend:** Vercel
- **Database:** PostgreSQL (Railway)
- **Cache/Queue:** Redis (Railway, opcional)

---

## 📜 SCRIPTS NPM

### Backend (`backend/package.json`)

```json
{
  "dev": "tsx watch src/server.ts",
  "build": "tsc --skipLibCheck && npx prisma generate",
  "build:ignore-errors": "tsc || node -e \"process.exit(0)\" && npx prisma generate",
  "start": "node dist/server.js",
  "start:with-migrations": "npx prisma migrate deploy && node dist/server.js",
  "start:prod": "node dist/server.js",
  "test": "jest",
  "test:watch": "jest --watch",
  "lint": "eslint src --ext .ts",
  "type-check": "tsc --noEmit",
  "prisma:generate": "prisma generate",
  "prisma:migrate": "prisma migrate dev",
  "prisma:deploy": "prisma migrate deploy",
  "prisma:seed": "tsx prisma/seed.ts",
  "prisma:studio": "prisma studio"
}
```

### Frontend (`frontend/package.json`)

```json
{
  "dev": "npm run sync-docs && vite",
  "build": "npm run sync-docs && vite build",
  "preview": "vite preview",
  "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
  "type-check": "tsc --noEmit",
  "test": "vitest",
  "test:ui": "vitest --ui",
  "test:coverage": "vitest --coverage",
  "sync-docs": "node ../scripts/sync_help_docs.mjs"
}
```

**Nota:** Ambos proyectos tienen `package-lock.json` (lockfiles presentes).

---

## 🚪 RUTAS PRINCIPALES Y ENTRYPOINTS

### Backend Entry Point

- **Main:** `backend/src/server.ts`
- **App:** `backend/src/app.ts`

### Health Endpoints

- **`GET /health`** - Liveness probe (aplicación corriendo)
- **`GET /api/health`** - Alias de /health con headers CORS
- **`GET /ready`** - Readiness probe (DB + Redis listos)
- **`GET /api/system/health/detailed`** - Health check detallado (requiere auth)

### Endpoints de Diagnóstico

- **`GET /api/cors-debug`** - Debug de configuración CORS
- **`GET /config`** - Configuración sanitizada (sin secretos)
- **`GET /version`** - Información de build/versión

### Rutas API Principales (50 archivos de rutas)

- `/api/auth` - Autenticación
- `/api/users` - Gestión de usuarios
- `/api/products` - Productos
- `/api/sales` - Ventas
- `/api/commissions` - Comisiones
- `/api/dashboard` - Dashboard y métricas
- `/api/opportunities` - Búsqueda de oportunidades (IA)
- `/api/marketplace` - Marketplaces (eBay, Amazon, MercadoLibre)
- `/api/api-credentials` - Gestión de credenciales API
- `/api/jobs` - Trabajos en background
- `/api/reports` - Reportes
- `/api/notifications` - Notificaciones
- `/api/system` - Sistema y health
- `/api/admin` - Funciones administrativas
- ... (46 rutas adicionales)

### Frontend Entry Point

- **Main:** `frontend/src/main.tsx`
- **App:** `frontend/src/App.tsx`
- **Vite Config:** `frontend/vite.config.ts`

---

## ⚙️ CONFIGURACIÓN DE ENTORNO

### Backend (Variables Requeridas)

**Críticas:**
- `DATABASE_URL` - PostgreSQL connection string (requerido)
- `JWT_SECRET` - Secret para JWT (requerido, min 32 chars)
- `ENCRYPTION_KEY` - Key para encriptar credenciales (requerido, min 32 chars, fallback a JWT_SECRET)

**Recomendadas:**
- `NODE_ENV` - development|production|test (default: development)
- `PORT` - Puerto del servidor (default: 3000)
- `API_URL` - URL pública del API (default: http://localhost:3000)
- `CORS_ORIGIN` o `CORS_ORIGINS` - Orígenes permitidos (comma-separated)
- `FRONTEND_URL` - URL del frontend (opcional, usado como fallback CORS)
- `REDIS_URL` - Redis connection string (opcional, default: redis://localhost:6379)
- `LOG_LEVEL` - error|warn|info|debug (default: info)

**Opcionales (APIs externas):**
- `EBAY_APP_ID`, `EBAY_DEV_ID`, `EBAY_CERT_ID`
- `MERCADOLIBRE_CLIENT_ID`, `MERCADOLIBRE_CLIENT_SECRET`
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`
- `GROQ_API_KEY`
- `SCRAPERAPI_KEY`
- ... (más en `backend/src/config/env.ts`)

### Frontend (Variables Requeridas)

**Críticas:**
- `VITE_API_URL` - URL del backend API (requerido para producción)

**Opcionales:**
- `VITE_ENABLE_INVESTOR_DOCS` - Feature flag para docs de inversionistas

### Validación de Entorno

El backend valida variables críticas al arranque:
- `DATABASE_URL` - Debe ser URL válida (postgresql://...)
- `JWT_SECRET` - Min 32 caracteres
- `ENCRYPTION_KEY` - Min 32 caracteres (o usa JWT_SECRET como fallback)

Si falta alguna crítica, el servidor **falla temprano** con mensaje claro.

**Archivo de configuración:** `backend/src/config/env.ts` (usa Zod para validación)

---

## 📊 ESTADO GIT

**Nota:** No se ejecutaron comandos git directamente. Para obtener estado actual:

```powershell
# Verificar branch actual
git branch --show-current

# Ver archivos modificados
git status

# Ver diferencias
git diff --stat
```

**Recomendación:** Ejecutar estos comandos manualmente antes de continuar con cambios.

---

## ✅ PRÓXIMOS PASOS

1. ✅ **FASE 0 COMPLETADA** - Snapshot creado
2. 🔄 **FASE 1** - Auditoría Backend (middlewares, security, error handling)
3. ⏳ **FASE 2** - Auditoría Frontend (config, error handling, accesibilidad)
4. ⏳ **FASE 3** - Auditoría de Dependencias
5. ⏳ **FASE 4** - Configuración y Secrets (CONFIG_MATRIX.md)
6. ⏳ **FASE 5** - Observabilidad (RUNBOOK.md, RELEASE_CHECKLIST.md)
7. ⏳ **FASE 6** - Release Gate Script (scripts/release_gate.ps1)
8. ⏳ **FASE 7** - Resumen Ejecutivo (PRODUCTION_READINESS_AUDIT.md)

---

**Última actualización:** 2025-01-28  
**Próxima fase:** FASE 1 - Auditoría Backend

