# 🚀 Plan de Acción - Ivan Reseller Web
## Sistema de Dropshipping Moderno - Arquitectura Web Completa

**Fecha de Creación:** 28 de Octubre, 2025  
**Proyecto:** Migración de Ivan Reseller (Python/Flask) a Aplicación Web Moderna (Node.js/React)

---

## 📋 Resumen Ejecutivo

Este documento define el plan completo para crear **Ivan_Reseller_Web**, una aplicación web moderna que replica y mejora todas las funcionalidades del sistema actual Python/Flask, utilizando tecnologías web modernas para desarrollo ágil, escalabilidad y edición en tiempo real.

---

## 🎯 Objetivos del Proyecto

1. ✅ **Funcionalidad Completa**: Portar TODAS las funcionalidades actuales
2. ✅ **Hot Reload**: Edición y actualización en tiempo real durante desarrollo
3. ✅ **UI Moderna**: Interfaz React responsive y profesional
4. ✅ **Escalable**: Arquitectura que crece con el negocio
5. ✅ **Fácil Despliegue**: Docker Compose para levantar todo con un comando
6. ✅ **TypeScript**: Type safety y mejor DX (Developer Experience)
7. ✅ **API REST**: Backend independiente consumible por múltiples clientes

---

## 🏗️ Stack Tecnológico Seleccionado

### Backend
- **Runtime**: Node.js 20 LTS
- **Framework**: Express.js 4.x
- **Lenguaje**: TypeScript 5.x
- **Base de Datos**: PostgreSQL 16
- **ORM**: Prisma 5.x (migraciones automáticas, type-safe)
- **Cache/Sessions**: Redis 7.x
- **Queue Jobs**: BullMQ (scraping, publishing en background)
- **Real-time**: Socket.io (logs, notificaciones)
- **Auth**: JWT + bcrypt
- **Validation**: Zod (type-safe validation)
- **HTTP Client**: Axios (llamadas a marketplaces)

### Frontend
- **Framework**: React 18.x
- **Build Tool**: Vite 5.x (HMR ultra-rápido)
- **Lenguaje**: TypeScript 5.x
- **Styling**: TailwindCSS 3.x + HeadlessUI
- **State Management**: Zustand (global) + React Query (server state)
- **Routing**: React Router 6.x
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts (analytics/dashboards)
- **Icons**: Lucide React
- **Notifications**: React Hot Toast

### DevOps
- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: Nginx
- **Process Manager**: PM2 (producción)
- **Environment**: dotenv
- **Linting**: ESLint + Prettier
- **Testing**: Jest + React Testing Library

---

## 📦 Estructura del Proyecto

```
Ivan_Reseller_Web/
│
├── backend/                          # Node.js + Express API
│   ├── src/
│   │   ├── server.ts                # Entry point
│   │   ├── app.ts                   # Express app configuration
│   │   ├── config/
│   │   │   ├── database.ts          # Prisma client
│   │   │   ├── redis.ts             # Redis client
│   │   │   └── env.ts               # Environment validation
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── users.routes.ts
│   │   │   │   ├── products.routes.ts
│   │   │   │   ├── sales.routes.ts
│   │   │   │   ├── commissions.routes.ts
│   │   │   │   ├── marketplace.routes.ts
│   │   │   │   └── dashboard.routes.ts
│   │   │   └── controllers/
│   │   │       ├── auth.controller.ts
│   │   │       ├── users.controller.ts
│   │   │       ├── products.controller.ts
│   │   │       ├── sales.controller.ts
│   │   │       ├── commissions.controller.ts
│   │   │       └── marketplace.controller.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts      # JWT, bcrypt, sessions
│   │   │   ├── user.service.ts      # User management
│   │   │   ├── commission.service.ts # Comisiones automáticas
│   │   │   ├── scraper.service.ts   # AliExpress scraping
│   │   │   ├── publisher.service.ts # Multi-marketplace publishing
│   │   │   ├── ebay.service.ts      # eBay API integration
│   │   │   ├── mercadolibre.service.ts # MercadoLibre API
│   │   │   ├── amazon.service.ts    # Amazon API
│   │   │   ├── paypal.service.ts    # PayPal payments
│   │   │   └── notification.service.ts # Email/webhook notifications
│   │   ├── jobs/
│   │   │   ├── scraping.job.ts      # Background scraping
│   │   │   ├── publishing.job.ts    # Background publishing
│   │   │   └── payout.job.ts        # Scheduled payouts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts   # JWT verification
│   │   │   ├── roles.middleware.ts  # Role-based access
│   │   │   ├── validation.middleware.ts # Zod validation
│   │   │   └── error.middleware.ts  # Error handling
│   │   ├── utils/
│   │   │   ├── logger.ts            # Winston logger
│   │   │   ├── encryption.ts        # bcrypt helpers
│   │   │   └── validators.ts        # Common validators
│   │   └── types/
│   │       ├── express.d.ts         # Express type extensions
│   │       └── index.ts             # Shared types
│   ├── prisma/
│   │   ├── schema.prisma            # Database schema
│   │   ├── migrations/              # Auto-generated migrations
│   │   └── seed.ts                  # Initial data seeding
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── frontend/                         # React SPA
│   ├── src/
│   │   ├── main.tsx                 # Entry point
│   │   ├── App.tsx                  # Root component
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Products/
│   │   │   │   ├── ProductList.tsx
│   │   │   │   ├── ProductDetail.tsx
│   │   │   │   └── ProductForm.tsx
│   │   │   ├── Sales/
│   │   │   │   ├── SalesList.tsx
│   │   │   │   └── SalesAnalytics.tsx
│   │   │   ├── Users/
│   │   │   │   ├── UserList.tsx
│   │   │   │   └── UserDetail.tsx
│   │   │   ├── Commissions/
│   │   │   │   ├── CommissionList.tsx
│   │   │   │   └── PayoutSchedule.tsx
│   │   │   └── Settings/
│   │   │       ├── ApiSettings.tsx
│   │   │       ├── MarketplaceSettings.tsx
│   │   │       └── ProfileSettings.tsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Navbar.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Footer.tsx
│   │   │   ├── common/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Table.tsx
│   │   │   │   └── Card.tsx
│   │   │   └── features/
│   │   │       ├── ProductCard.tsx
│   │   │       ├── SalesChart.tsx
│   │   │       └── CommissionSummary.tsx
│   │   ├── services/
│   │   │   ├── api.ts               # Axios instance
│   │   │   ├── auth.api.ts
│   │   │   ├── products.api.ts
│   │   │   ├── sales.api.ts
│   │   │   └── users.api.ts
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useProducts.ts
│   │   │   └── useSales.ts
│   │   ├── stores/
│   │   │   ├── authStore.ts         # Zustand auth state
│   │   │   └── uiStore.ts           # UI state (sidebar, modals)
│   │   ├── types/
│   │   │   ├── api.types.ts
│   │   │   ├── product.types.ts
│   │   │   ├── user.types.ts
│   │   │   └── sale.types.ts
│   │   ├── utils/
│   │   │   ├── formatters.ts        # Date, currency formatters
│   │   │   └── validators.ts
│   │   └── styles/
│   │       └── globals.css          # Tailwind imports
│   ├── public/
│   │   └── logo.svg
│   ├── index.html
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── Dockerfile
│
├── nginx/
│   └── nginx.conf                   # Reverse proxy config
│
├── docker-compose.yml               # Full stack orchestration
├── docker-compose.dev.yml           # Development overrides
├── .env.example                     # Environment template
├── .gitignore
├── README.md                        # Main documentation
└── PLAN_ACCION.md                   # Este archivo
```

---

## 🗄️ Schema de Base de Datos (Prisma)

### Modelos Principales

```prisma
model User {
  id                Int       @id @default(autoincrement())
  username          String    @unique
  email             String    @unique
  passwordHash      String
  role              Role      @default(USER)
  commissionRate    Decimal   @default(10.00)
  fixedMonthlyCost  Decimal   @default(17.00)
  isActive          Boolean   @default(true)
  paypalEmail       String?
  phone             String?
  fullName          String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  lastLogin         DateTime?
  
  apiCredentials    ApiCredential[]
  products          Product[]
  sales             Sale[]
  commissions       Commission[]
  activities        Activity[]
}

model ApiCredential {
  id            Int       @id @default(autoincrement())
  userId        Int
  apiName       String    // ebay, mercadolibre, amazon, paypal
  credentials   Json      // Encrypted JSON
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([userId, apiName])
}

model Product {
  id                  Int       @id @default(autoincrement())
  userId              Int
  aliexpressUrl       String
  title               String
  description         String?
  aliexpressPrice     Decimal
  suggestedPrice      Decimal
  finalPrice          Decimal?
  category            String?
  images              Json      // Array of URLs
  productData         Json?     // Full scraped data
  status              ProductStatus @default(PENDING)
  isPublished         Boolean   @default(false)
  publishedAt         DateTime?
  approvalId          String?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  
  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  sales               Sale[]
}

model Sale {
  id                Int       @id @default(autoincrement())
  userId            Int
  productId         Int
  orderId           String
  marketplace       String    // ebay, mercadolibre, amazon
  salePrice         Decimal
  aliexpressCost    Decimal
  marketplaceFee    Decimal
  grossProfit       Decimal
  commissionAmount  Decimal
  netProfit         Decimal
  status            SaleStatus @default(PENDING)
  trackingNumber    String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  product           Product   @relation(fields: [productId], references: [id])
  commission        Commission?
}

model Commission {
  id                Int       @id @default(autoincrement())
  userId            Int
  saleId            Int       @unique
  amount            Decimal
  status            CommissionStatus @default(PENDING)
  scheduledPayoutAt DateTime?
  paidAt            DateTime?
  paypalTxnId       String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  sale              Sale      @relation(fields: [saleId], references: [id])
}

model Activity {
  id            Int       @id @default(autoincrement())
  userId        Int
  action        String
  description   String
  ipAddress     String?
  userAgent     String?
  createdAt     DateTime  @default(now())
  
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum Role {
  ADMIN
  USER
}

enum ProductStatus {
  PENDING
  APPROVED
  REJECTED
  PUBLISHED
  INACTIVE
}

enum SaleStatus {
  PENDING
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
}

enum CommissionStatus {
  PENDING
  SCHEDULED
  PAID
  FAILED
}
```

---

## 🔌 API REST Endpoints

### Autenticación
- `POST /api/auth/register` - Registrar nuevo usuario
- `POST /api/auth/login` - Login (devuelve JWT)
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Obtener usuario actual

### Usuarios (Admin)
- `GET /api/users` - Listar usuarios
- `GET /api/users/:id` - Obtener usuario
- `PUT /api/users/:id` - Actualizar usuario
- `DELETE /api/users/:id` - Eliminar usuario
- `GET /api/users/:id/balance` - Balance del usuario

### Productos
- `GET /api/products` - Listar productos (filtros: status, userId)
- `GET /api/products/:id` - Obtener producto
- `POST /api/products` - Crear producto (scraping)
- `PUT /api/products/:id` - Actualizar producto
- `DELETE /api/products/:id` - Eliminar producto
- `POST /api/products/:id/approve` - Aprobar producto (admin)
- `POST /api/products/:id/publish` - Publicar en marketplace

### Ventas
- `GET /api/sales` - Listar ventas
- `GET /api/sales/:id` - Obtener venta
- `POST /api/sales` - Registrar venta (webhook)
- `PUT /api/sales/:id` - Actualizar venta
- `GET /api/sales/analytics` - Analytics de ventas

### Comisiones
- `GET /api/commissions` - Listar comisiones
- `GET /api/commissions/:id` - Obtener comisión
- `GET /api/commissions/pending` - Comisiones pendientes
- `POST /api/commissions/:id/payout` - Ejecutar payout

### Marketplace
- `POST /api/marketplace/scrape` - Scrape de AliExpress
- `POST /api/marketplace/publish` - Publicar producto
- `GET /api/marketplace/credentials` - Obtener credenciales
- `PUT /api/marketplace/credentials` - Actualizar credenciales

### Dashboard
- `GET /api/dashboard/stats` - Estadísticas generales
- `GET /api/dashboard/recent-sales` - Ventas recientes
- `GET /api/dashboard/top-products` - Productos top

---

## 🎨 Páginas y Componentes React

### Páginas Principales
1. **Login/Register** - Autenticación
2. **Dashboard** - Overview con métricas y gráficos
3. **Productos** - Lista, búsqueda, filtros, CRUD
4. **Ventas** - Historial, analytics, gráficos
5. **Comisiones** - Lista, pendientes, historial payouts
6. **Usuarios** - Gestión (solo admin)
7. **Configuración** - APIs, perfil, preferencias

### Componentes Reutilizables
- Layout (Navbar, Sidebar, Footer)
- Tablas con paginación y filtros
- Modales (confirmación, formularios)
- Cards de métricas
- Gráficos (líneas, barras, pie)
- Formularios con validación
- Notificaciones toast
- Loading states y skeletons

---

## 🚀 Plan de Implementación (Fases)

### Fase 1: Fundamentos (Días 1-2)
- [x] Análisis del sistema actual
- [x] Diseño de arquitectura
- [ ] Crear estructura de carpetas
- [ ] Configurar backend (Node.js + TypeScript + Express)
- [ ] Configurar frontend (Vite + React + TypeScript)
- [ ] Setup de Docker Compose
- [ ] Configurar Prisma + PostgreSQL
- [ ] Crear schema de base de datos

### Fase 2: Backend Core (Días 3-4)
- [ ] Implementar autenticación JWT
- [ ] Crear modelos y servicios de Usuario
- [ ] Implementar middleware de autenticación y roles
- [ ] Crear servicios de Producto
- [ ] Crear servicios de Venta
- [ ] Crear servicios de Comisión
- [ ] Implementar error handling global

### Fase 3: Integraciones Externas (Días 5-6)
- [ ] Servicio de Scraping (AliExpress)
- [ ] Servicio de eBay API
- [ ] Servicio de MercadoLibre API
- [ ] Servicio de Amazon API (básico)
- [ ] Servicio de PayPal
- [ ] Sistema de webhooks

### Fase 4: Frontend Base (Días 7-8)
- [ ] Layout principal (Navbar, Sidebar)
- [ ] Página de Login/Register
- [ ] Dashboard con métricas básicas
- [ ] Lista de productos con filtros
- [ ] Formulario de producto
- [ ] Configuración de API client (Axios)
- [ ] Zustand stores (auth, UI)

### Fase 5: Frontend Avanzado (Días 9-10)
- [ ] Página de ventas con analytics
- [ ] Gráficos con Recharts
- [ ] Página de comisiones
- [ ] Página de usuarios (admin)
- [ ] Página de configuración
- [ ] Real-time updates (Socket.io)
- [ ] Notificaciones toast

### Fase 6: Background Jobs (Días 11-12)
- [ ] Configurar BullMQ
- [ ] Job de scraping automático
- [ ] Job de publicación en background
- [ ] Job de payouts programados
- [ ] Dashboard de jobs (monitoreo)

### Fase 7: Testing y Optimización (Días 13-14)
- [ ] Tests unitarios (backend)
- [ ] Tests de integración (API)
- [ ] Tests de componentes (frontend)
- [ ] Optimización de queries (Prisma)
- [ ] Cache con Redis
- [ ] Compresión y optimización de assets

### Fase 8: Documentación y Deploy (Día 15)
- [ ] README completo
- [ ] API documentation (Swagger)
- [ ] Guía de desarrollo
- [ ] Guía de despliegue
- [ ] Docker Compose para producción
- [ ] Scripts de migración de datos

---

## 🔧 Comandos de Desarrollo

### Instalación Inicial
```bash
# Clonar repositorio
git clone <repo>
cd Ivan_Reseller_Web

# Levantar stack completo con Docker
docker-compose up -d

# Backend (desarrollo sin Docker)
cd backend
npm install
npm run dev

# Frontend (desarrollo sin Docker)
cd frontend
npm install
npm run dev

# Ejecutar migraciones de Prisma
cd backend
npx prisma migrate dev
npx prisma generate
```

### Comandos de Desarrollo
```bash
# Hot reload backend (puerto 3000)
npm run dev

# Hot reload frontend (puerto 5173)
npm run dev

# Lint
npm run lint

# Type check
npm run type-check

# Tests
npm run test
npm run test:watch
```

### Docker
```bash
# Levantar todo
docker-compose up -d

# Ver logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Rebuild
docker-compose up -d --build

# Stop
docker-compose down

# Limpiar todo
docker-compose down -v
```

---

## 🌍 Variables de Entorno

### Backend (.env)
```env
# Server
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ivan_reseller

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# Marketplace APIs
EBAY_APP_ID=
EBAY_DEV_ID=
EBAY_CERT_ID=
EBAY_SANDBOX=true

MERCADOLIBRE_CLIENT_ID=
MERCADOLIBRE_CLIENT_SECRET=

AMAZON_ACCESS_KEY=
AMAZON_SECRET_KEY=

# PayPal
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_MODE=sandbox

# Scraping
SCRAPERAPI_KEY=
ZENROWS_API_KEY=

# Email (opcional)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
VITE_ENABLE_DEVTOOLS=true
```

---

## 📊 Métricas de Éxito

- ✅ Hot reload funcional en < 1 segundo
- ✅ API REST con respuestas < 200ms (promedio)
- ✅ Frontend carga inicial < 2 segundos
- ✅ Todas las funcionalidades del sistema actual portadas
- ✅ TypeScript coverage > 90%
- ✅ Test coverage > 70%
- ✅ Docker Compose levanta stack en < 30 segundos
- ✅ UI responsive en mobile, tablet, desktop
- ✅ Documentación completa y actualizada

---

## 🎯 Próximos Pasos Inmediatos

1. ✅ Crear estructura de carpetas
2. ✅ Inicializar package.json en backend y frontend
3. ✅ Configurar TypeScript
4. ✅ Crear schema de Prisma
5. ✅ Configurar Express básico
6. ✅ Configurar Vite + React básico
7. ✅ Crear Docker Compose

---

## 📝 Notas Importantes

- **Compatibilidad**: Mantener compatibilidad con datos actuales (migración desde SQLite)
- **Seguridad**: Todas las credenciales en variables de entorno, nunca hardcodeadas
- **Escalabilidad**: Arquitectura preparada para microservicios si es necesario
- **Mantenibilidad**: Código limpio, bien documentado, con tipos
- **Performance**: Cache, lazy loading, code splitting
- **UX**: Loading states, error handling, confirmaciones

---

## 🤝 Contribución

Este proyecto es evolutivo. Se aceptan:
- Mejoras de performance
- Nuevas integraciones de marketplace
- Mejoras de UI/UX
- Tests adicionales
- Documentación

---

## 📞 Soporte

Para dudas o issues:
1. Revisar documentación
2. Revisar logs (`docker-compose logs`)
3. Crear issue en repositorio

---

**Estado**: 🚀 En Desarrollo Activo  
**Versión**: 1.0.0-alpha  
**Última Actualización**: 28 de Octubre, 2025
