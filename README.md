# Ivan Reseller Web - Modern Dropshipping Platform

🚀 **Aplicación web completa de dropshipping multi-marketplace con arquitectura moderna**

[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express-4-lightgrey)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed)](https://www.docker.com/)

---

## 📋 Descripción

Sistema completo de dropshipping automatizado con arquitectura web moderna (Node.js + React + TypeScript). Replica todas las funcionalidades del sistema Python/Flask actual con mejoras significativas en desarrollo, escalabilidad y mantenibilidad.

### ✨ Características Principales

- **🔐 Autenticación JWT** - Sesiones seguras con tokens
- **👥 Multi-Usuario** - Sistema de roles (Admin/User)
- **💰 Comisiones Automáticas** - Cálculo y seguimiento automático (10% + costo fijo)
- **🛒 Multi-Marketplace** - eBay, MercadoLibre, Amazon
- **🔍 Scraping Inteligente** - AliExpress con IA y validación de demanda real (Google Trends)
- **⚙️ Sistema de Workflow Flexible** - Manual, Automatic o Guided por etapa
- **🌐 Ambientes Separados** - Sandbox y Production por usuario
- **📊 Dashboard en Tiempo Real** - Métricas y analytics
- **🔔 Notificaciones en Tiempo Real** - Socket.IO para alertas y acciones guided
- **⚡ Hot Reload** - Desarrollo ultra-rápido
- **🐳 Docker** - Despliegue con un comando

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                     NGINX (Reverse Proxy)                    │
└──────────────────┬────────────────────┬─────────────────────┘
                   │                    │
         ┌─────────▼─────────┐  ┌──────▼──────┐
         │   Frontend React  │  │   Backend   │
         │   (Vite + TS)     │  │  (Express)  │
         │   Port: 5173      │  │  Port: 3000 │
         └───────────────────┘  └──────┬──────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  │                    │                    │
          ┌───────▼────────┐  ┌────────▼──────┐  ┌────────▼────────┐
          │   PostgreSQL   │  │     Redis     │  │   BullMQ Jobs   │
          │   (Database)   │  │    (Cache)    │  │  (Background)   │
          └────────────────┘  └───────────────┘  └─────────────────┘
```

---

## 🚀 Inicio Rápido

### Prerrequisitos

- **Docker** y **Docker Compose**
- **Node.js** 20+ (solo para desarrollo sin Docker)
- **Git**

### Instalación con Docker (Recomendado)

```bash
# 1. Clonar repositorio
cd c:\Ivan_Reseller_Web

# 2. Copiar variables de entorno
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Editar backend/.env con tus credenciales (JWT_SECRET, APIs, etc.)

# 4. Levantar stack completo
docker-compose up -d

# 5. Ejecutar migraciones de base de datos
docker-compose exec backend npx prisma migrate dev

# 6. (Opcional) Seed de datos iniciales
docker-compose exec backend npx prisma db seed
```

**¡Listo! 🎉**

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Health Check: http://localhost:3000/health

### Instalación Manual (Sin Docker)

#### Backend

```bash
cd backend

# Instalar dependencias
npm install

# Configurar .env
cp .env.example .env
# Editar .env con tus credenciales

# Iniciar PostgreSQL y Redis localmente (o usar servicios en la nube)

# Ejecutar migraciones
npx prisma migrate dev
npx prisma generate

# Iniciar servidor
npm run dev
```

#### Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Configurar .env
cp .env.example .env

# Iniciar app
npm run dev
```

---

## 📚 Documentación

### Documentos Principales

- **Guía de Usuario:** `docs/GUIDE_MOD_GUIDED_USUARIOS.md`
- **Estado Funcional:** `docs/ESTADO_FUNCIONAL_WORKFLOW_SISTEMA.md`
- **Auditoría Completa:** `docs/AUDITORIA_COMPLETA_FLUJO_DROPSHIPPING.md`
- **Changelog:** `docs/CHANGELOG_WORKFLOW_2025_01_26.md`

### Estructura del Proyecto

```
Ivan_Reseller_Web/
├── backend/                 # API Node.js + Express
│   ├── src/
│   │   ├── api/            # Routes & Controllers
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Auth, validation, errors
│   │   ├── config/         # Database, Redis, env
│   │   ├── jobs/           # Background jobs (BullMQ)
│   │   └── server.ts       # Entry point
│   ├── prisma/             # Database schema & migrations
│   ├── package.json
│   └── Dockerfile
│
├── frontend/               # React SPA
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable components
│   │   ├── services/      # API calls
│   │   ├── stores/        # Zustand state
│   │   ├── hooks/         # Custom hooks
│   │   └── main.tsx       # Entry point
│   ├── package.json
│   └── Dockerfile
│
├── docker-compose.yml      # Full stack orchestration
├── PLAN_ACCION.md          # Plan detallado
└── README.md               # Este archivo
```

### Comandos Útiles

#### Docker

```bash
# Levantar todo
docker-compose up -d

# Ver logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Rebuild específico
docker-compose up -d --build backend

# Detener todo
docker-compose down

# Limpiar volúmenes (⚠️ elimina datos)
docker-compose down -v

# Acceder al contenedor
docker-compose exec backend sh
docker-compose exec frontend sh

# Ejecutar migraciones
docker-compose exec backend npx prisma migrate dev

# Ver base de datos (Prisma Studio)
docker-compose exec backend npx prisma studio
```

#### Desarrollo

```bash
# Backend
cd backend
npm run dev          # Hot reload
npm run build        # Compilar TypeScript
npm run start        # Producción
npm run lint         # Linting
npm run type-check   # Type checking

# Frontend
cd frontend
npm run dev          # Hot reload (http://localhost:5173)
npm run build        # Build producción
npm run preview      # Preview build
npm run lint         # Linting
```

### Base de Datos

#### Migraciones con Prisma

```bash
# Crear migración
npx prisma migrate dev --name descripcion_cambio

# Ejecutar migraciones pendientes
npx prisma migrate deploy

# Reset database (⚠️ elimina datos)
npx prisma migrate reset

# Ver estado
npx prisma migrate status

# Generar cliente Prisma
npx prisma generate

# Abrir Prisma Studio (GUI)
npx prisma studio
```

#### Seed de Datos

```bash
# Crear usuario admin inicial
docker-compose exec backend npx prisma db seed
```

---

## 🔐 Seguridad

### Variables de Entorno Críticas

```env
# backend/.env
JWT_SECRET=<generar-con-openssl-rand-base64-32>
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://host:6379

# APIs (nunca commitear)
EBAY_APP_ID=
MERCADOLIBRE_CLIENT_SECRET=
PAYPAL_CLIENT_SECRET=
```

### Generar JWT Secret Seguro

```bash
# Linux/Mac
openssl rand -base64 64

# Windows PowerShell
[Convert]::ToBase64String((1..64|%{Get-Random -Max 256}))
```

---

## 🛠️ Configuración de APIs

Las APIs se configuran desde la interfaz web en **Settings → Configuración de APIs** o mediante variables de entorno.

### APIs Críticas para Dropshipping

1. **AliExpress Affiliate** - Para búsqueda de productos
2. **Marketplace (eBay/MercadoLibre/Amazon)** - Para publicar productos
3. **PayPal** - Para gestionar pagos
4. **AliExpress Dropshipping** - Para compras automáticas

### APIs Recomendadas

- **Google Trends (SerpAPI)** - Para validación de demanda real
- **GROQ AI** - Para análisis inteligente de oportunidades

### Configuración Manual (Variables de Entorno)

#### eBay

1. Crear app en [eBay Developers](https://developer.ebay.com/)
2. Obtener App ID, Dev ID, Cert ID
3. Configurar en `backend/.env`:

```env
EBAY_APP_ID=your-app-id
EBAY_DEV_ID=your-dev-id
EBAY_CERT_ID=your-cert-id
EBAY_SANDBOX=true
```

#### MercadoLibre

1. Crear app en [MercadoLibre Developers](https://developers.mercadolibre.com/)
2. Obtener Client ID y Secret
3. Configurar en `backend/.env` o desde la UI (OAuth)

#### PayPal

1. Crear app en [PayPal Developer](https://developer.paypal.com/)
2. Obtener Client ID y Secret
3. Modo sandbox o production en `.env` o desde la UI

---

## ⚙️ Sistema de Workflow

El sistema permite configurar el comportamiento de cada etapa del proceso de dropshipping de forma flexible.

### Modos de Workflow

- **Manual Global:** Todas las etapas requieren aprobación manual
- **Automatic Global:** Todas las etapas se ejecutan automáticamente
- **Hybrid:** Configuración individual por etapa

### Modos por Etapa

Cada etapa puede configurarse individualmente:

- **Manual:** Pausa y requiere aprobación en cada paso
- **Automatic:** Se ejecuta sin intervención
- **Guided:** Notifica y espera confirmación (timeout de 5 minutos)

### Etapas Disponibles

1. **SCRAPE** - Búsqueda de oportunidades en AliExpress
2. **ANALYZE** - Análisis de rentabilidad y demanda
3. **PUBLISH** - Publicación en marketplaces
4. **PURCHASE** - Compra automática cuando hay ventas
5. **FULFILLMENT** - Gestión de envíos y tracking
6. **CUSTOMER SERVICE** - Atención al cliente

### Configuración

1. Ir a **Settings → Configuración de Workflow**
2. Seleccionar ambiente (Sandbox/Production)
3. Seleccionar modo global (Manual/Automatic/Hybrid)
4. Configurar cada etapa individualmente
5. Guardar configuración

**Documentación completa:** Ver `docs/GUIDE_MOD_GUIDED_USUARIOS.md` y `docs/ESTADO_FUNCIONAL_WORKFLOW_SISTEMA.md`

---

## 📊 API REST

### Autenticación

```bash
# Register
POST /api/auth/register
Body: { username, email, password }

# Login
POST /api/auth/login
Body: { username, password }
Response: { user, token }

# Get current user
GET /api/auth/me
Headers: Authorization: Bearer <token>
```

### Productos

```bash
# List products
GET /api/products?status=PENDING&limit=20

# Get product
GET /api/products/:id

# Create product (scrape)
POST /api/products
Body: { aliexpressUrl }

# Publish product
POST /api/products/:id/publish
Body: { marketplace: "ebay" | "mercadolibre" }
```

### Workflow

```bash
# Get workflow configuration
GET /api/workflow/config

# Update workflow configuration
PUT /api/workflow/config
Body: { environment, workflowMode, stageScrape, stageAnalyze, ... }

# Validate configuration
GET /api/workflow/validate

# Handle guided action
POST /api/workflow/handle-guided-action
Body: { action, actionId, data }

# Continue stage (guided mode)
POST /api/workflow/continue-stage
Body: { stage, action, data }
```

### Dashboard

```bash
# Get stats
GET /api/dashboard/stats
Response: { totalProducts, totalSales, totalRevenue, pendingCommissions }
```

Ver documentación completa en `docs/` (auditorías y guías detalladas).

---

## 🧪 Testing

```bash
# Backend
cd backend
npm run test         # Run tests
npm run test:watch   # Watch mode

# Frontend
cd frontend
npm run test
```

---

## 🚢 Despliegue en Producción

### Con Docker

```bash
# 1. Build images
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# 2. Push to registry
docker tag ivan_reseller_backend:latest your-registry/backend:latest
docker push your-registry/backend:latest

# 3. Deploy to server
docker-compose -f docker-compose.prod.yml up -d
```

### Variables de Entorno Producción

```env
NODE_ENV=production
DATABASE_URL=<postgresql-production-url>
REDIS_URL=<redis-production-url>
JWT_SECRET=<strong-secret-64-chars>
CORS_ORIGIN=https://your-domain.com

# PayPal Production
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=<live-client-id>
PAYPAL_CLIENT_SECRET=<live-secret>
```

---

## 🤝 Contribución

1. Fork el repositorio
2. Crear branch (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -m 'feat: nueva funcionalidad'`)
4. Push al branch (`git push origin feature/nueva-funcionalidad`)
5. Abrir Pull Request

### Convenciones

- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)
- **Código**: TypeScript estricto, ESLint, Prettier
- **Tests**: Coverage > 70%

---

## 📝 Migración desde Sistema Actual

Si vienes del sistema Python/Flask actual (`ivan_reseller`):

### Script de Migración de Datos

```bash
# TODO: Crear script de migración SQLite → PostgreSQL
cd backend
npm run migrate:from-sqlite
```

### Diferencias Clave

| Aspecto | Sistema Actual (Python) | Nuevo Sistema (Node.js) |
|---------|------------------------|------------------------|
| Backend | Flask + Python | Express + TypeScript |
| Frontend | HTML + Jinja | React + TypeScript |
| Base de Datos | SQLite | PostgreSQL |
| Real-time | SSE | Socket.io |
| Hot Reload | ❌ | ✅ |
| Docker | Opcional | Incluido |
| Type Safety | Parcial | Completo |
| API | REST | REST (misma API) |

**Compatibilidad**: Las APIs mantienen los mismos endpoints para facilitar la transición.

---

## 📖 Recursos

- **Plan de Acción Completo**: [PLAN_ACCION.md](./PLAN_ACCION.md)
- **Prisma Docs**: https://www.prisma.io/docs
- **React Docs**: https://react.dev
- **Express Docs**: https://expressjs.com
- **TypeScript Docs**: https://www.typescriptlang.org/docs

---

## 📄 Licencia

MIT License - Ver [LICENSE](./LICENSE) para detalles

---

## 👨‍💻 Autor

**Ivan Reseller Team**

- GitHub: [@GodinesCrazy](https://github.com/GodinesCrazy)
- Repository: [ivan_reseller2](https://github.com/GodinesCrazy/ivan_reseller2)

---

## 🎯 Estado del Proyecto

- ✅ **Fase 1**: Arquitectura y estructura base
- ✅ **Fase 2**: Backend core (Auth, Database, API)
- ✅ **Fase 3**: Frontend base (React, Dashboard)
- ✅ **Fase 4**: Integraciones marketplace (eBay, MercadoLibre, Amazon)
- ✅ **Fase 5**: Background jobs y scraping
- ✅ **Fase 6**: Sistema de Workflow completo (Manual/Automatic/Guided)
- ✅ **Fase 7**: Validación de oportunidades con Google Trends
- 🔄 **Fase 8**: Testing y optimización (En progreso)
- ✅ **Fase 9**: Documentación completa

### Funcionalidades Completadas

- ✅ Sistema de workflow flexible (Manual/Automatic/Guided)
- ✅ Ambientes separados (Sandbox/Production) por usuario
- ✅ Validación de demanda real con Google Trends
- ✅ Compra automática con validación de capital
- ✅ Publicación multi-marketplace
- ✅ Notificaciones en tiempo real (Socket.IO)
- ✅ Tracking de acciones guided con timeouts
- ✅ Scripts de prueba automatizados

**Última actualización**: 26 de Enero, 2025

---

**¿Necesitas ayuda?** Abre un [issue](https://github.com/GodinesCrazy/ivan_reseller2/issues) o consulta el [Plan de Acción](./PLAN_ACCION.md).
