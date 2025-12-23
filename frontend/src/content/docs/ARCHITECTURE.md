# 🏗️ Architecture - Ivan Reseller

**Arquitectura del sistema y diseño técnico**

**Última actualización:** 2025-01-27  
**Versión:** 1.0

---

## 📋 Índice

1. [Visión General](#visión-general)
2. [Stack Tecnológico](#stack-tecnológico)
3. [Arquitectura del Sistema](#arquitectura-del-sistema)
4. [Módulos del Backend](#módulos-del-backend)
5. [Módulos del Frontend](#módulos-del-frontend)
6. [Flujos Principales](#flujos-principales)
7. [Base de Datos](#base-de-datos)
8. [Integraciones Externas](#integraciones-externas)

---

## 🎯 Visión General

Ivan Reseller es una plataforma SaaS de dropshipping automatizado que permite a los usuarios:

- Buscar oportunidades de productos en AliExpress
- Analizar rentabilidad y demanda
- Publicar productos en múltiples marketplaces (eBay, Amazon, MercadoLibre)
- Automatizar compras cuando hay ventas
- Gestionar envíos y tracking
- Calcular y pagar comisiones automáticamente

### Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React/Vite)                    │
│              https://www.ivanreseller.com                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
                       │ CORS
┌──────────────────────▼──────────────────────────────────────┐
│              Backend API (Express/Node.js)                  │
│         https://backend.up.railway.app                      │
└──────┬──────────────────┬──────────────────┬──────────────┘
       │                  │                  │
┌──────▼──────┐  ┌────────▼────────┐  ┌───────▼────────┐
│ PostgreSQL  │  │     Redis       │  │  External APIs │
│  (Database) │  │  (Cache/Queue)  │  │  (eBay, etc.)  │
└─────────────┘  └─────────────────┘  └────────────────┘
```

---

## 🛠️ Stack Tecnológico

### Backend

- **Runtime:** Node.js 20+
- **Framework:** Express.js 4.x
- **Lenguaje:** TypeScript 5.x
- **ORM:** Prisma
- **Base de Datos:** PostgreSQL 16+
- **Cache/Queue:** Redis 7+ con BullMQ
- **Autenticación:** JWT (jsonwebtoken)
- **Validación:** Zod
- **Logging:** Winston
- **Testing:** Jest

### Frontend

- **Framework:** React 18
- **Build Tool:** Vite
- **Lenguaje:** TypeScript 5.x
- **Routing:** React Router 6
- **State Management:** Zustand
- **HTTP Client:** Axios
- **UI Components:** Tailwind CSS + shadcn/ui
- **Markdown:** react-markdown + remark-gfm

### Infraestructura

- **Hosting Backend:** Railway
- **Hosting Frontend:** Vercel (recomendado) o Railway
- **Base de Datos:** Railway PostgreSQL
- **Cache:** Railway Redis
- **CI/CD:** Git push → Auto-deploy

---

## 🏛️ Arquitectura del Sistema

### Capas de la Aplicación

```
┌─────────────────────────────────────────────────┐
│           Presentation Layer (Frontend)          │
│  - React Components                             │
│  - Pages (Dashboard, Products, Settings, etc.) │
│  - State Management (Zustand)                   │
└──────────────────┬──────────────────────────────┘
                   │ HTTP/REST + WebSocket
┌──────────────────▼──────────────────────────────┐
│            API Layer (Backend)                  │
│  - Express Routes (/api/*)                      │
│  - Middleware (Auth, CORS, Validation)          │
│  - Error Handling                               │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│         Business Logic Layer (Services)          │
│  - Product Service                              │
│  - Opportunity Service                          │
│  - Workflow Service                             │
│  - Marketplace Services (eBay, Amazon, etc.)     │
│  - AI Services                                  │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│          Data Access Layer                       │
│  - Prisma ORM                                    │
│  - Database (PostgreSQL)                        │
│  - Cache (Redis)                                │
└─────────────────────────────────────────────────┘
```

---

## 🔧 Módulos del Backend

### Core Services

**Ubicación:** `backend/src/services/`

#### Autenticación y Autorización
- `auth.service.ts` - Login, registro, JWT, refresh tokens
- `security.service.ts` - Cifrado de credenciales (AES-256-GCM)

#### Productos y Oportunidades
- `product.service.ts` - Gestión de productos
- `opportunity.service.ts` - Búsqueda y análisis de oportunidades
- `ai-opportunity.service.ts` - Motor de IA para oportunidades
- `opportunity-finder.service.ts` - Búsqueda automatizada

#### Marketplaces
- `ebay.service.ts` - Integración con eBay Trading API
- `amazon.service.ts` - Integración con Amazon SP-API
- `mercadolibre.service.ts` - Integración con MercadoLibre API
- `marketplace.service.ts` - Servicio unificado de marketplaces

#### Scraping y AliExpress
- `scraping.service.ts` - Scraping básico
- `advanced-scraper.service.ts` - Scraping avanzado con Puppeteer
- `aliexpress-affiliate-api.service.ts` - API oficial de AliExpress Affiliate
- `aliexpress-dropshipping-api.service.ts` - API oficial de AliExpress Dropshipping
- `aliexpress-auto-purchase.service.ts` - Compra automática con navegador

#### Workflow y Automatización
- `workflow.service.ts` - Ejecución de workflows
- `workflow-config.service.ts` - Configuración de workflows
- `workflow-executor.service.ts` - Ejecutor de etapas
- `workflow-scheduler.service.ts` - Programación de workflows
- `automated-business.service.ts` - Sistema de negocio automatizado
- `autopilot.service.ts` - Sistema Autopilot 24/7

#### Background Jobs
- `job.service.ts` - Gestión de jobs en background
- `scheduled-tasks.service.ts` - Tareas programadas (cron)

#### Finanzas
- `commission.service.ts` - Cálculo y gestión de comisiones
- `sale.service.ts` - Gestión de ventas
- `paypal-payout.service.ts` - Pagos automáticos vía PayPal
- `financial-alerts.service.ts` - Alertas financieras
- `cost-calculator.service.ts` - Cálculo de costos

#### Otros
- `notification.service.ts` - Notificaciones en tiempo real (Socket.IO)
- `credentials-manager.service.ts` - Gestión de credenciales de APIs
- `api-availability.service.ts` - Verificación de disponibilidad de APIs
- `user.service.ts` - Gestión de usuarios
- `admin.service.ts` - Funcionalidades de administrador

### API Routes

**Ubicación:** `backend/src/api/routes/`

- `auth.routes.ts` - Autenticación (login, logout, refresh)
- `products.routes.ts` - Productos (CRUD, publish, unpublish)
- `opportunities.routes.ts` - Oportunidades (buscar, analizar)
- `dashboard.routes.ts` - Dashboard (stats, activity)
- `workflow-config.routes.ts` - Configuración de workflow
- `autopilot.routes.ts` - Sistema Autopilot
- `admin.routes.ts` - Funciones de admin
- `api-credentials.routes.ts` - Gestión de credenciales de APIs
- `reports.routes.ts` - Reportes y analytics
- `system.routes.ts` - Health checks, config

---

## 🎨 Módulos del Frontend

### Pages

**Ubicación:** `frontend/src/pages/`

- `Dashboard.tsx` - Dashboard principal con métricas
- `Products.tsx` - Lista y gestión de productos
- `Opportunities.tsx` - Búsqueda y análisis de oportunidades
- `Autopilot.tsx` - Sistema Autopilot
- `WorkflowConfig.tsx` - Configuración de workflow
- `APISettings.tsx` - Configuración de APIs
- `Settings.tsx` - Configuración general
- `Users.tsx` - Gestión de usuarios (admin)
- `Reports.tsx` - Reportes y analytics
- `FinanceDashboard.tsx` - Dashboard financiero
- `HelpCenter.tsx` - Centro de ayuda
- `APIDocsList.tsx` - Lista de documentación de APIs
- `APIDocViewer.tsx` - Visualizador de documentación

### Components

**Ubicación:** `frontend/src/components/`

- Componentes reutilizables (UI, forms, cards, etc.)
- Componentes específicos (AIOpportunityFinder, WorkflowSummaryWidget, etc.)
- Help components (MarkdownViewer, APIDocsRegistry)

### Services

**Ubicación:** `frontend/src/services/`

- `api.ts` - Cliente Axios configurado
- Otros servicios de integración

### Stores (State Management)

**Ubicación:** `frontend/src/stores/`

- `authStore.ts` - Estado de autenticación
- `authStatusStore.ts` - Estado de autenticación (status)
- Otros stores según necesidad

---

## 🔄 Flujos Principales

### 1. Flujo de Autenticación

```
Usuario → Login → Backend valida → JWT Token → Cookie + Header
         ↓
Frontend almacena token → Requests incluyen token → Backend valida → Acceso
```

**Archivos relevantes:**
- `backend/src/middleware/auth.middleware.ts`
- `backend/src/services/auth.service.ts`
- `frontend/src/stores/authStore.ts`

### 2. Flujo de Búsqueda de Oportunidades

```
Usuario → Buscar producto → Backend → AliExpress API/Scraping
         ↓
Backend analiza → IA evalúa → Google Trends (opcional)
         ↓
Oportunidades encontradas → Frontend muestra → Usuario selecciona
```

**Archivos relevantes:**
- `backend/src/services/opportunity-finder.service.ts`
- `backend/src/services/ai-opportunity.service.ts`
- `frontend/src/pages/Opportunities.tsx`

### 3. Flujo de Publicación

```
Producto seleccionado → Workflow configurado → Etapa SCRAPE → ANALYZE
         ↓
PUBLISH → Marketplace API (eBay/Amazon/MercadoLibre) → Publicado
```

**Archivos relevantes:**
- `backend/src/services/workflow.service.ts`
- `backend/src/services/ebay.service.ts` (y otros marketplaces)
- `frontend/src/pages/Products.tsx`

### 4. Flujo de Compra Automática

```
Venta detectada → Workflow PURCHASE → Validar capital → AliExpress API/Navegador
         ↓
Compra realizada → Tracking → Actualizar estado
```

**Archivos relevantes:**
- `backend/src/services/aliexpress-auto-purchase.service.ts`
- `backend/src/services/aliexpress-dropshipping-api.service.ts`

---

## 💾 Base de Datos

### Schema Principal (Prisma)

**Ubicación:** `backend/prisma/schema.prisma`

#### Tablas Principales

- `User` - Usuarios del sistema
- `Product` - Productos
- `Opportunity` - Oportunidades encontradas
- `Sale` - Ventas realizadas
- `Commission` - Comisiones
- `ApiCredential` - Credenciales de APIs (cifradas)
- `WorkflowConfig` - Configuración de workflow por usuario
- `Job` - Jobs en background
- `Notification` - Notificaciones

---

## 🔌 Integraciones Externas

### Marketplaces

- **eBay Trading API** - Publicación y gestión de productos
- **Amazon SP-API** - Integración con Amazon Seller Partner
- **MercadoLibre API** - Publicación en MercadoLibre

### AliExpress

- **AliExpress Affiliate API** - Extracción de datos de productos
- **AliExpress Dropshipping API** - Creación de órdenes automatizadas
- **Scraping** - Scraping con Puppeteer (fallback)

### Servicios de Terceros

- **GROQ AI** - Generación de títulos y descripciones
- **ScraperAPI / ZenRows** - Web scraping
- **2Captcha** - Resolución de captchas
- **SerpAPI** - Google Trends
- **PayPal** - Pagos automáticos

---

## 📚 Recursos Adicionales

- **README:** [README.md](../README.md)
- **Setup Local:** [docs/SETUP_LOCAL.md](./SETUP_LOCAL.md)
- **Deployment:** [docs/DEPLOYMENT_RAILWAY.md](./DEPLOYMENT_RAILWAY.md)
- **Security:** [docs/SECURITY.md](./SECURITY.md)

---

**Última actualización:** 2025-01-27

