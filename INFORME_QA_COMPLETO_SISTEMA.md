# 🔍 INFORME DE CONTROL DE CALIDAD COMPLETO - IVAN RESELLER

**Fecha:** 2025-01-27  
**Auditor:** Líder de QA + Arquitecto de Software + Desarrollador Full-Stack Senior  
**Versión del Sistema:** 1.0  
**Repositorio:** Ivan Reseller Web  
**URL:** www.ivanreseller.com

---

## 📋 RESUMEN EJECUTIVO

### Estado General del Sistema

**Veredicto:** ⚠️ **FUNCIONAL CON RESERVAS CRÍTICAS**

- ✅ **Funcionalidades Core:** 75-80% operativas
- ⚠️ **Consistencia Manual vs Código:** 60-70% alineado
- ❌ **Completitud de Flujos:** 65-75% completos
- ⚠️ **Calidad de Implementación:** Requiere mejoras críticas

### 🚨 Problemas Críticos Identificados

Se detectaron **10 problemas críticos** (ver sección 11):
1. 🔴 **Fallos parciales de publicación** no reflejan estado real (CRÍTICO)
2. 🔴 **Workflows personalizados** no validados E2E (CRÍTICO)
3. 🟡 **Inconsistencias en estados** de productos (ALTA)
4. 🟡 **Falta validación de credenciales** en autopilot/workflows (ALTA)
5. 🟡 **TODOs en código crítico** (MEDIA)
6. 🟡 **Manejo de errores inconsistente** (MEDIA)
7. 🟡 **Falta validación de precios** en algunos flujos (MEDIA)
8. 🟢 **Falta caché de conversiones** de moneda (BAJA)
9. 🟢 **Falta validación de cron** en frontend (BAJA)
10. 🟢 **Falta documentación** de APIs internas (BAJA)

### Capacidades Reales

- ✅ **Dropshipping Manual (Sandbox):** Funcional básicamente
- ⚠️ **Dropshipping Manual (Production):** Requiere validación de credenciales
- ⚠️ **Dropshipping Automático (Autopilot):** Funcional pero con limitaciones
- ❌ **Workflows Personalizados:** Recién implementados (requieren validación E2E)

---

## 1. CHECKLIST FUNCIONAL BASADO EN MANUAL

### 1.1 USUARIO (USER) - Funcionalidades Requeridas

#### 🔐 Autenticación y Registro

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Login con email/password | ✅ | `POST /api/auth/login` | Funcional |
| Registro público | ❌ | Deshabilitado (403) | Manual dice "solo admin puede crear" |
| Solicitud de acceso | ✅ | `POST /api/access-requests/request` | Implementado recientemente |
| Cambio de contraseña | ✅ | `POST /api/users/:id/password` | Funcional |
| Refresh token automático | ✅ | Cookie httpOnly con refresh | Implementado |
| Logout | ✅ | `POST /api/auth/logout` | Funcional |
| Sesión persistente | ✅ | localStorage + cookies | Funcional |

**📝 Notas:**
- El registro público está deshabilitado correctamente según manual
- Sistema de solicitud de acceso implementado (P0.5)

---

#### ⚙️ Configuración de APIs

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Configurar eBay API (OAuth) | ✅ | `GET /api/marketplace/auth-url/ebay` | Funcional |
| Configurar Amazon SP-API | ✅ | `POST /api/marketplace/credentials` | Funcional |
| Configurar MercadoLibre API | ✅ | `GET /api/marketplace/auth-url/mercadolibre` | Funcional |
| Configurar AliExpress (scraping) | ✅ | Manual auth session | Funcional |
| Configurar GROQ AI | ✅ | `POST /api/credentials` | Funcional |
| Configurar PayPal | ✅ | `POST /api/credentials` | Funcional |
| Configurar ScraperAPI/ZenRows | ✅ | `POST /api/credentials` | Funcional |
| Configurar 2Captcha | ⚠️ | Backend preparado | Frontend no tiene UI específica |
| Seleccionar ambiente (sandbox/production) | ✅ | Por API, por UserWorkflowConfig | Funcional |
| Validar credenciales antes de usar | ✅ | `POST /api/marketplace/test-connection/:mp` | Implementado |
| Encriptación AES-256-GCM | ✅ | `CredentialsManager` | Funcional |

**📝 Notas:**
- OAuth de eBay funciona pero requiere re-autorización ocasional
- Validación de credenciales implementada recientemente

---

#### 🔄 Configuración de Workflow

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Environment (sandbox/production) | ✅ | `UserWorkflowConfig.environment` | Funcional |
| Workflow Mode (manual/automatic/hybrid) | ✅ | `UserWorkflowConfig.workflowMode` | Funcional |
| Config por etapa (scrape, analyze, publish, etc.) | ✅ | `stageScrape`, `stageAnalyze`, etc. | Funcional |
| Capital de trabajo | ✅ | `UserWorkflowConfig.workingCapital` | Funcional |
| Umbrales de auto-aprobación | ✅ | `autoApproveThreshold`, `autoPublishThreshold` | Funcional |
| Max auto-investment | ✅ | `maxAutoInvestment` | Funcional |
| Guardar configuración | ✅ | `PUT /api/workflow/config` | Funcional |
| Workflows personalizados | ✅ | `AutopilotWorkflow` model | Recién implementado (requiere validación) |

**📝 Notas:**
- Workflows personalizados implementados pero no validados end-to-end
- Frontend tiene UI completa para workflows personalizados

---

#### 🔍 Búsqueda de Oportunidades

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Búsqueda por término | ✅ | `POST /api/opportunities/search` | Funcional |
| Selección de región | ✅ | Parámetro `region` | Funcional |
| Selección de cantidad (1-10) | ✅ | Parámetro `maxItems` | Funcional |
| Selección de marketplaces | ✅ | Parámetro `marketplaces[]` | Funcional |
| Mostrar: título, costo, precio sugerido | ✅ | `OpportunityItem` | Funcional |
| Mostrar: margen, ROI, competencia | ✅ | `OpportunityItem` | Funcional |
| Mostrar: score de confianza (0-100) | ✅ | `confidenceScore` | Funcional |
| Mostrar: imagen del producto | ✅ | Campo `image` | Funcional (corregido recientemente) |
| Mostrar: enlace AliExpress | ✅ | `aliexpressUrl` | Funcional |
| Crear producto desde oportunidad | ✅ | Botón "Importar" | Funcional |
| Búsqueda IA avanzada | ⚠️ | `AIOpportunityFinder` component | Existe pero funcionalidad limitada |

**📝 Notas:**
- Imágenes corregidas recientemente (Task 1)
- Búsqueda IA existe pero no está completamente integrada con backend

---

#### 📦 Gestión de Productos

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Ver lista de productos | ✅ | `GET /api/products` | Funcional |
| Filtros por estado | ✅ | Query param `status` | Funcional |
| Crear desde oportunidad | ✅ | `POST /api/products` | Funcional |
| Crear por scraping automático | ✅ | URL de AliExpress | Funcional |
| Crear manualmente | ✅ | Formulario manual | Funcional |
| Editar producto | ✅ | `PUT /api/products/:id` | Funcional |
| Cambiar estado | ✅ | `PATCH /api/products/:id/status` | Funcional |
| Eliminar producto | ✅ | `DELETE /api/products/:id` | Funcional |
| Ver estadísticas | ✅ | Dashboard | Funcional |
| Estados: PENDING, APPROVED, PUBLISHED, INACTIVE | ✅ | Enum en BD | Funcional |
| Sincronización de precios | ⚠️ | `PATCH /api/products/:id/price` | Actualiza BD, APIs pendiente |

**📝 Notas:**
- Sincronización de precios actualiza BD pero no APIs de marketplaces (documentado como TODO)

---

#### 🚀 Publicación en Marketplaces

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Publicación manual | ✅ | `POST /api/publisher/approve/:id` | Funcional |
| Selección de marketplace(s) | ✅ | Body `{ marketplaces: [...] }` | Funcional |
| Generación automática de título | ⚠️ | Backend preparado | No siempre usa IA |
| Generación automática de descripción | ⚠️ | Backend preparado | No siempre usa IA |
| Optimización de precio | ✅ | `suggestedPrice` calculado | Funcional |
| Selección de categoría | ✅ | Campo `category` | Funcional |
| Manejo de imágenes | ✅ | Campo `images` (JSON) | Funcional |
| Publicación a múltiples marketplaces | ✅ | `publishToMultipleMarketplaces` | Funcional |
| Tracking de publicaciones (éxito/fallo) | ✅ | `publishResults` en respuesta | Funcional |
| Validación de credenciales antes de publicar | ✅ | Middleware `validateMarketplaceCredentials` | Implementado recientemente |

**📝 Notas:**
- Validación de credenciales implementada recientemente
- Generación con IA no siempre se usa (depende de configuración)

---

#### 💰 Gestión de Ventas

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Ver lista de ventas | ✅ | `GET /api/sales` | Funcional |
| Registrar venta manualmente | ✅ | `POST /api/sales` | Funcional |
| Registrar desde webhook (automático) | ⚠️ | `POST /api/webhooks/:marketplace` | Backend preparado, requiere configuración |
| Ver detalle de venta | ✅ | `GET /api/sales/:id` | Funcional |
| Actualizar estado | ✅ | `PATCH /api/sales/:id/status` | Funcional |
| Tracking de órdenes | ✅ | Campo `trackingNumber` | Funcional |
| Cálculo automático de ganancias | ✅ | En `sale.service.ts` | Funcional |
| Estados: PENDING, PROCESSING, SHIPPED, DELIVERED | ✅ | Enum en BD | Funcional |
| Ver estadísticas | ✅ | Dashboard | Funcional |

**📝 Notas:**
- Webhooks no están completamente configurados (requiere setup externo)

---

#### 💸 Sistema de Comisiones

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Cálculo automático al crear venta | ✅ | `commission.service.ts` | Funcional |
| Ver lista de comisiones | ✅ | `GET /api/commissions` | Funcional |
| Estados: PENDING, SCHEDULED, PAID | ✅ | Enum en BD | Funcional |
| Programación de pagos | ✅ | `POST /api/commissions/:id/schedule` | Funcional |
| Pago individual | ✅ | `POST /api/commissions/:id/pay` | Funcional |
| Pago en lote | ✅ | `POST /api/commissions/batch-pay` | Funcional |
| Ver balance del usuario | ✅ | Campo `balance` en User | Funcional |
| Historial de pagos | ✅ | `GET /api/commissions` con filtros | Funcional |
| Fórmula: Gross Profit × Commission Rate | ✅ | Implementado | Funcional |

**📝 Notas:**
- Fórmula de comisiones implementada correctamente
- Multi-tenant security validada recientemente

---

#### 🤖 Sistema Autopilot

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Activar/desactivar autopilot | ✅ | `POST /api/autopilot/start`, `/stop` | Funcional |
| Configurar intervalo de ciclos | ✅ | `updateConfig({ cycleIntervalMinutes })` | Funcional |
| Seleccionar modo (manual/automatic) | ✅ | `publicationMode` en config | Funcional |
| Seleccionar marketplace objetivo | ✅ | `targetMarketplace` en config | Funcional |
| Configurar límites (máx oportunidades, capital) | ✅ | `maxOpportunitiesPerCycle`, `workingCapital` | Funcional |
| Configurar márgenes mínimos | ✅ | `minProfitUsd`, `minRoiPct` | Funcional |
| Agregar queries de búsqueda | ✅ | `searchQueries[]` en config | Funcional |
| Activar optimización | ✅ | `optimizationEnabled` en config | Funcional |
| Ver estadísticas | ✅ | `GET /api/autopilot/stats` | Funcional |
| Ver estado (idle/running/paused/error) | ✅ | `GET /api/autopilot/status` | Funcional |
| Ver performance por categoría | ✅ | `getPerformanceReport()` | Funcional |
| Ver última ejecución | ✅ | `lastRunTimestamp` | Funcional |
| Ejecutar ciclo manualmente | ✅ | `runSingleCycle()` | Funcional |
| Workflows personalizados | ✅ | `AutopilotWorkflow` | Recién implementado |

**📝 Notas:**
- Autopilot básico funcional y probado
- Workflows personalizados recién implementados (FASE 1-7 completadas)

---

#### 💵 Dashboard y Finanzas

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Dashboard principal | ✅ | `GET /api/dashboard` | Funcional |
| Balance actual | ✅ | Campo `balance` en User | Funcional |
| Ventas totales | ✅ | `totalSales` en User | Funcional |
| Ingresos totales | ✅ | `totalEarnings` en User | Funcional |
| Ganancias totales | ✅ | Calculado desde ventas | Funcional |
| Comisiones pendientes | ✅ | `GET /api/commissions?status=PENDING` | Funcional |
| Productos activos | ✅ | `GET /api/products?status=PUBLISHED` | Funcional |
| Productos pendientes | ✅ | `GET /api/products?status=PENDING` | Funcional |
| Gráficas de ventas | ⚠️ | Frontend preparado | Datos disponibles, visualización básica |
| Gráficas de ganancias | ⚠️ | Frontend preparado | Datos disponibles, visualización básica |
| Dashboard financiero detallado | ⚠️ | `FinanceDashboard.tsx` | Existe pero funcionalidad limitada |
| Reportes (ventas, ganancias, productos) | ✅ | `GET /api/reports/*` | Funcional |
| Exportación (JSON, Excel, PDF) | ⚠️ | Backend preparado | Excel/PDF pueden requerir más desarrollo |

**📝 Notas:**
- Dashboard funcional pero visualización de gráficas limitada
- Reportes básicos funcionan, avanzados pueden tener limitaciones

---

#### 🔔 Notificaciones y Alertas

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Notificaciones en tiempo real (Socket.IO) | ✅ | `NotificationService` | Funcional |
| Notificaciones por email | ⚠️ | Backend preparado | Requiere configuración SMTP |
| Notificaciones push (futuro) | ❌ | No implementado | Manual no menciona |
| Ver notificaciones | ✅ | `GET /api/notifications` | Funcional |
| Marcar como leída | ✅ | `PUT /api/notifications/:id/read` | Funcional |
| Tipos: INFO, SUCCESS, WARNING, ERROR | ✅ | Enum en BD | Funcional |
| Test de notificaciones | ✅ | `POST /api/notifications/test` | Funcional (corregido recientemente) |

**📝 Notas:**
- Socket.IO funcional para notificaciones en tiempo real
- Email requiere configuración SMTP

---

### 1.2 ADMINISTRADOR (ADMIN) - Funcionalidades Requeridas

#### 👥 Gestión de Usuarios

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Login como admin | ✅ | Mismo login, verificación de rol | Funcional |
| Listar usuarios | ✅ | `GET /api/users` (solo admin) | Funcional |
| Crear usuario | ✅ | `POST /api/users` (solo admin) | Funcional |
| Editar usuario | ✅ | `PUT /api/users/:id` (solo admin) | Funcional |
| Eliminar usuario | ✅ | `DELETE /api/users/:id` (solo admin) | Funcional |
| Configurar commission rate | ✅ | Campo `commissionRate` | Funcional |
| Configurar fixed monthly cost | ✅ | Campo `fixedMonthlyCost` | Funcional |
| Activar/desactivar usuario | ✅ | Campo `isActive` | Funcional |
| Ver estadísticas por usuario | ✅ | `GET /api/users/:id/stats` | Funcional |
| Aprobar/rechazar solicitudes de acceso | ✅ | `POST /api/access-requests/:id/approve|reject` | Funcional |

**📝 Notas:**
- Sistema de solicitudes de acceso implementado (P0.5)
- Todos los endpoints requieren autorización ADMIN

---

#### 📊 Panel de Administración

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Dashboard administrativo | ✅ | `AdminPanel.tsx` | Funcional |
| Métricas globales | ✅ | `GET /api/admin/stats` | Funcional |
| Ver todos los usuarios | ✅ | `GET /api/users` | Funcional |
| Ver todas las ventas | ✅ | `GET /api/sales` (sin filtro userId) | Funcional |
| Ver todas las comisiones | ✅ | `GET /api/commissions` (sin filtro userId) | Funcional |
| Configuración global del sistema | ⚠️ | `SystemConfig` model | Existe pero UI limitada |
| Credenciales globales (compartidas) | ✅ | `scope: 'global'` en ApiCredential | Funcional |
| Logs del sistema | ✅ | `GET /api/logs` | Funcional |
| Monitoreo de salud | ✅ | `GET /health`, `GET /api/system/health/detailed` | Funcional |

**📝 Notas:**
- Panel admin funcional
- Logs del sistema disponibles

---

#### 💼 Gestión de Comisiones (Admin)

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Ver todas las comisiones | ✅ | `GET /api/commissions` | Funcional |
| Marcar como pagado | ✅ | `POST /api/commissions/:id/pay` | Funcional |
| Procesar pagos en lote | ✅ | `POST /api/commissions/batch-pay` | Funcional |
| Ver historial de pagos | ✅ | `GET /api/commissions` con filtros | Funcional |
| Configurar porcentajes de comisión | ✅ | Al crear/editar usuario | Funcional |

**📝 Notas:**
- Sistema de comisiones funcional

---

### 1.3 REQUISITOS TÉCNICOS

#### 🔒 Multi-Tenant

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| Aislamiento por userId | ✅ | Filtrado en queries | Implementado |
| Admin puede ver todo | ✅ | Middleware `authorize('ADMIN')` | Funcional |
| Validación de ownership | ✅ | Verificaciones en servicios | Implementado recientemente |
| Datos encriptados por usuario | ✅ | Credenciales encriptadas | Funcional |

**📝 Notas:**
- Multi-tenant security mejorada recientemente (P0.1)

---

#### 🔐 Seguridad

| Requisito | Estado | Implementación | Notas |
|-----------|--------|----------------|-------|
| JWT authentication | ✅ | Middleware `authenticate` | Funcional |
| Encriptación de credenciales | ✅ | AES-256-GCM | Funcional |
| HTTPS obligatorio | ⚠️ | Depende de deployment | No controlado por código |
| CORS configurado | ✅ | `cors` middleware | Funcional |
| Rate limiting | ✅ | `express-rate-limit` | Funcional |
| Validación de inputs | ✅ | Zod schemas | Funcional |

**📝 Notas:**
- Seguridad básica implementada correctamente

---

---

## 2. MAPA TÉCNICO DEL SISTEMA

### 2.1 Backend

#### **Archivos de Entrada**
- `backend/src/server.ts` - Punto de entrada principal
- `backend/src/app.ts` - Configuración Express y rutas

#### **Estructura de Rutas** (45 archivos de rutas)

**Autenticación:**
- `auth.routes.ts` - Login, logout, refresh, registro (deshabilitado)
- `access-requests.routes.ts` - Solicitudes de acceso

**Usuarios y Admin:**
- `users.routes.ts` - CRUD de usuarios
- `admin.routes.ts` - Panel administrativo
- `admin-commissions.routes.ts` - Comisiones admin

**Productos y Oportunidades:**
- `products.routes.ts` - CRUD de productos
- `opportunities.routes.ts` - Búsqueda de oportunidades
- `publisher.routes.ts` - Publicación inteligente

**Marketplaces:**
- `marketplace.routes.ts` - Operaciones generales de marketplaces
- `marketplace-oauth.routes.ts` - OAuth callbacks
- `amazon.routes.ts` - Operaciones específicas Amazon
- `ebay.service.ts` - Lógica específica eBay (servicio, no ruta)

**Ventas y Comisiones:**
- `sales.routes.ts` - Gestión de ventas
- `commissions.routes.ts` - Gestión de comisiones

**Autopilot y Workflows:**
- `autopilot.routes.ts` - Control de autopilot básico + workflows personalizados
- `workflow-config.routes.ts` - Configuración global de workflow

**Configuración:**
- `api-credentials.routes.ts` - Gestión de credenciales
- `settings.routes.ts` - Configuración de usuario
- `regional.routes.ts` - Configuración regional

**Sistema:**
- `system.routes.ts` - Health checks, features
- `logs.routes.ts` - Logs del sistema
- `dashboard.routes.ts` - Datos del dashboard
- `reports.routes.ts` - Reportes básicos
- `advanced-reports.routes.ts` - Reportes avanzados
- `notifications.routes.ts` - Notificaciones
- `jobs.routes.ts` - Jobs en segundo plano
- `finance.routes.ts` - Dashboard financiero

**Servicios Especializados:**
- `dropshipping.routes.ts` - Dropshipping flexible
- `manual-auth.routes.ts` - Autenticación manual AliExpress
- `captcha.routes.ts` - Resolución de captchas
- `financial-alerts.routes.ts` - Alertas financieras
- `business-metrics.routes.ts` - Métricas de negocio
- `cost-optimization.routes.ts` - Optimización de costos
- `referral.routes.ts` - Sistema de referidos
- `pricing-tiers.routes.ts` - Tiers de precios
- `successful-operations.routes.ts` - Operaciones exitosas
- `webhooks.routes.ts` - Webhooks de marketplaces

#### **Servicios Principales** (58+ servicios)

**Core:**
- `auth.service.ts` - Autenticación y JWT
- `user.service.ts` - Gestión de usuarios
- `product.service.ts` - Gestión de productos
- `sale.service.ts` - Gestión de ventas
- `commission.service.ts` - Gestión de comisiones

**Marketplaces:**
- `marketplace.service.ts` - Servicio principal de marketplaces
- `ebay.service.ts` - Integración específica eBay
- `amazon.service.ts` - Integración específica Amazon
- `mercadolibre.service.ts` - Integración específica MercadoLibre

**Scraping y Oportunidades:**
- `opportunity-finder.service.ts` - Buscador de oportunidades
- `advanced-scraper.service.ts` - Scraping avanzado
- `stealth-scraping.service.ts` - Scraping sigiloso
- `scraper-bridge.service.ts` - Bridge Python
- `competitor-analyzer.service.ts` - Análisis de competencia

**Autopilot:**
- `autopilot.service.ts` - Sistema autopilot básico
- `workflow-config.service.ts` - Configuración de workflow
- `workflow.service.ts` - Workflows personalizados (NUEVO)
- `workflow-executor.service.ts` - Ejecutor de workflows (NUEVO)
- `workflow-scheduler.service.ts` - Scheduler de workflows (NUEVO)

**Financiero:**
- `fx.service.ts` - Conversión de monedas
- `cost-calculator.service.ts` - Cálculo de costos
- `financial-alerts.service.ts` - Alertas financieras
- `business-metrics.service.ts` - Métricas de negocio

**Autenticación y Seguridad:**
- `credentials-manager.service.ts` - Gestión de credenciales
- `manual-auth.service.ts` - Autenticación manual
- `ali-auth-monitor.service.ts` - Monitoreo de sesión AliExpress
- `security.service.ts` - Seguridad

**Notificaciones:**
- `notification.service.ts` - Notificaciones en tiempo real
- `email.service.ts` - Envío de emails

**Jobs y Background:**
- `job.service.ts` - Gestión de jobs
- `scheduled-tasks.service.ts` - Tareas programadas
- `scheduled-reports.service.ts` - Reportes programados

**IA y Analytics:**
- `ai-opportunity.service.ts` - Análisis IA de oportunidades
- `ai-suggestions.service.ts` - Sugerencias IA
- `ceo-agent.service.ts` - Agente CEO

**Otros:**
- `access-request.service.ts` - Solicitudes de acceso
- `user-settings.service.ts` - Configuración de usuario
- `opportunity.service.ts` - Persistencia de oportunidades
- Y más...

#### **Middlewares**
- `auth.middleware.ts` - Autenticación JWT
- `error.middleware.ts` - Manejo centralizado de errores
- `rate-limit.middleware.ts` - Rate limiting
- `api-check.middleware.ts` - Verificación de APIs

#### **Modelos Prisma Principales**

```prisma
User - Usuarios (ADMIN/USER)
ApiCredential - Credenciales de APIs (encriptadas)
Product - Productos
Sale - Ventas
Commission - Comisiones
UserWorkflowConfig - Configuración global de workflow
AutopilotWorkflow - Workflows personalizados (NUEVO)
Opportunity - Oportunidades encontradas
MarketplaceListing - Listings en marketplaces
AccessRequest - Solicitudes de acceso
UserSettings - Configuración de usuario (tema, idioma, etc.)
SystemConfig - Configuración del sistema
```

---

### 2.2 Frontend

#### **Punto de Entrada**
- `frontend/src/main.tsx` - Entry point
- `frontend/src/App.tsx` - Componente raíz con rutas

#### **Páginas Principales** (27 archivos)

**Autenticación:**
- `Login.tsx` - Login
- `RequestAccess.tsx` - Solicitar acceso
- `ManualLogin.tsx` - Login manual AliExpress

**Dashboard y Principal:**
- `Dashboard.tsx` - Dashboard principal
- `FinanceDashboard.tsx` - Dashboard financiero
- `AdminPanel.tsx` - Panel de administración

**Productos y Oportunidades:**
- `Opportunities.tsx` - Búsqueda de oportunidades
- `OpportunitiesHistory.tsx` - Historial
- `OpportunityDetail.tsx` - Detalle de oportunidad
- `Products.tsx` - Gestión de productos
- `IntelligentPublisher.tsx` - Publicador inteligente

**Ventas y Comisiones:**
- `Sales.tsx` - Gestión de ventas
- `Commissions.tsx` - Gestión de comisiones

**Configuración:**
- `Settings.tsx` - Configuración general
- `APISettings.tsx` - Configuración de APIs
- `APIKeys.tsx` - Gestión de API keys
- `APIConfiguration.tsx` - Configuración de APIs (alternativa)
- `OtherCredentials.tsx` - Otras credenciales
- `WorkflowConfig.tsx` - Configuración de workflow
- `RegionalConfig.tsx` - Configuración regional

**Autopilot:**
- `Autopilot.tsx` - Control de autopilot + workflows personalizados

**Sistema:**
- `Users.tsx` - Gestión de usuarios (admin)
- `Reports.tsx` - Reportes
- `Jobs.tsx` - Jobs en segundo plano
- `SystemLogs.tsx` - Logs del sistema
- `HelpCenter.tsx` - Centro de ayuda

**Otros:**
- `FlexibleDropshipping.tsx` - Dropshipping flexible
- `ResolveCaptcha.tsx` - Resolución de captchas

#### **Sistema de Rutas**

```typescript
// Rutas públicas
/login
/request-access
/manual-login/:token

// Rutas protegidas (USER)
/dashboard
/opportunities
/products
/publisher
/sales
/commissions
/autopilot
/settings
/finance
/reports
/workflow-config
/regional

// Rutas protegidas (ADMIN)
/admin
/users
/logs
```

---

### 2.3 Base de Datos

**PostgreSQL** con Prisma ORM

**Modelos Clave:**
- `User` - Sistema multi-tenant
- `Product` - Productos del usuario
- `Sale` - Ventas
- `Commission` - Comisiones
- `ApiCredential` - Credenciales encriptadas
- `UserWorkflowConfig` - Configuración de workflow
- `AutopilotWorkflow` - Workflows personalizados
- `Opportunity` - Oportunidades encontradas
- `MarketplaceListing` - Listings activos
- `AccessRequest` - Solicitudes de acceso
- `UserSettings` - Configuración de usuario
- Y más...

---

### 2.4 Infraestructura

- **Redis:** Cache y BullMQ (jobs)
- **BullMQ:** Jobs en segundo plano
- **Socket.IO:** Notificaciones real-time
- **Railway.app:** Deployment
- **NGINX:** Reverse proxy (si está configurado)

---

## 3. MATRIZ "MANUAL VS CÓDIGO" (FUNCIONALIDAD)

| Requisito del Manual | Estado | Implementación | Brecha |
|----------------------|--------|----------------|--------|
| **1.1 Acceso y Registro** | | | |
| Login con email/password | ✅ Implementado | `POST /api/auth/login` | Ninguna |
| Registro público | ❌ Deshabilitado | Retorna 403 | Correcto según manual |
| Solicitud de acceso | ✅ Implementado | `POST /api/access-requests/request` | Ninguna |
| **1.2 Configuración de APIs** | | | |
| eBay OAuth | ✅ Implementado | `GET /api/marketplace/auth-url/ebay` | Funciona, pero requiere re-auth ocasional |
| Amazon SP-API | ✅ Implementado | `POST /api/marketplace/credentials` | Ninguna |
| MercadoLibre OAuth | ✅ Implementado | `GET /api/marketplace/auth-url/mercadolibre` | Ninguna |
| AliExpress (scraping) | ✅ Implementado | Manual auth session | Ninguna |
| Validación antes de publicar | ✅ Implementado | `validateMarketplaceCredentials` | Ninguna (implementado recientemente) |
| **1.3 Configuración de Workflow** | | | |
| Environment (sandbox/production) | ✅ Implementado | `UserWorkflowConfig.environment` | Ninguna |
| Workflow Mode | ✅ Implementado | `UserWorkflowConfig.workflowMode` | Ninguna |
| Config por etapa | ✅ Implementado | `stageScrape`, etc. | Ninguna |
| Capital de trabajo | ✅ Implementado | `workingCapital` | Ninguna |
| Umbrales | ✅ Implementado | `autoApproveThreshold`, etc. | Ninguna |
| Workflows personalizados | ⚠️ Recién implementado | `AutopilotWorkflow` | Requiere validación E2E |
| **1.4 Búsqueda de Oportunidades** | | | |
| Búsqueda básica | ✅ Implementado | `POST /api/opportunities/search` | Ninguna |
| Mostrar métricas | ✅ Implementado | `OpportunityItem` | Ninguna |
| Mostrar imágenes | ✅ Implementado | Campo `image` | Corregido recientemente |
| Búsqueda IA avanzada | ⚠️ Parcial | `AIOpportunityFinder.tsx` | Backend no completamente integrado |
| **1.5 Gestión de Productos** | | | |
| CRUD completo | ✅ Implementado | `products.routes.ts` | Ninguna |
| Estados correctos | ✅ Implementado | Enum en BD | Ninguna |
| Sincronización de precios | ⚠️ Parcial | Actualiza BD | No actualiza APIs de marketplaces |
| **1.6 Sistema Autopilot** | | | |
| Iniciar/detener | ✅ Implementado | `POST /api/autopilot/start|stop` | Ninguna |
| Configuración completa | ✅ Implementado | `updateConfig()` | Ninguna |
| Estadísticas | ✅ Implementado | `GET /api/autopilot/stats` | Ninguna |
| Performance por categoría | ✅ Implementado | `getPerformanceReport()` | Ninguna |
| Ciclos automáticos | ✅ Implementado | Timer en `autopilot.service.ts` | Ninguna |
| **1.7 Publicación en Marketplaces** | | | |
| Publicación manual | ✅ Implementado | `POST /api/publisher/approve/:id` | Ninguna |
| Múltiples marketplaces | ✅ Implementado | `publishToMultipleMarketplaces` | Ninguna |
| Generación con IA | ⚠️ Parcial | Backend preparado | No siempre se usa |
| Validación de credenciales | ✅ Implementado | Middleware | Ninguna (implementado recientemente) |
| **1.8 Gestión de Ventas** | | | |
| Registrar venta | ✅ Implementado | `POST /api/sales` | Ninguna |
| Actualizar estado | ✅ Implementado | `PATCH /api/sales/:id/status` | Ninguna |
| Cálculo automático | ✅ Implementado | `sale.service.ts` | Ninguna |
| **1.9 Dashboard y Finanzas** | | | |
| Dashboard principal | ✅ Implementado | `GET /api/dashboard` | Ninguna |
| Métricas básicas | ✅ Implementado | Campos en User | Ninguna |
| Gráficas | ⚠️ Limitado | Frontend preparado | Visualización básica |
| Dashboard financiero | ⚠️ Limitado | `FinanceDashboard.tsx` | Funcionalidad limitada |
| **1.10 Configuración de APIs** | ✅ Implementado | `APISettings.tsx` | Ninguna |
| **1.11 Configuración de Workflow** | ✅ Implementado | `WorkflowConfig.tsx` | Ninguna |
| **1.12 Notificaciones** | ✅ Implementado | Socket.IO + `NotificationService` | Email requiere SMTP |
| **2. ADMIN - Gestión de Usuarios** | ✅ Implementado | `Users.tsx` + rutas | Ninguna |
| **2. ADMIN - Panel Administrativo** | ✅ Implementado | `AdminPanel.tsx` | Ninguna |
| **2. ADMIN - Logs del Sistema** | ✅ Implementado | `SystemLogs.tsx` | Ninguna |

---

## 4. CONSISTENCIA DE DATOS Y MODELOS

### 4.1 Modelos de BD vs Manual

| Concepto Manual | Campo BD | Estado | Notas |
|----------------|----------|--------|-------|
| Usuario commission rate | `User.commissionRate` | ✅ | Coincide |
| Costo fijo mensual | `User.fixedMonthlyCost` | ✅ | Coincide |
| Estados de producto | `Product.status` (PENDING/APPROVED/PUBLISHED/INACTIVE) | ✅ | Coincide |
| Estados de venta | `Sale.status` (PENDING/PROCESSING/SHIPPED/DELIVERED) | ✅ | Coincide |
| Capital de trabajo | `UserWorkflowConfig.workingCapital` | ✅ | Coincide |
| Environment | `UserWorkflowConfig.environment` (sandbox/production) | ✅ | Coincide |
| Workflow mode | `UserWorkflowConfig.workflowMode` (manual/automatic/hybrid) | ✅ | Coincide |
| Tema (dark/light) | `UserSettings.theme` | ✅ | Implementado recientemente |

**Inconsistencias Detectadas:**

1. **Campo `Product.approvalId`**
   - Manual: No menciona específicamente
   - BD: Existe pero raramente se actualiza
   - Impacto: Bajo

2. **Campo `Product.publishedAt`**
   - Manual: No menciona explícitamente
   - BD: Existe y se actualiza
   - Impacto: Ninguno

3. **Campo `Sale.isCompleteCycle`**
   - Manual: Menciona ciclo completo
   - BD: Existe pero no siempre se actualiza correctamente
   - Impacto: Medio (afecta métricas de éxito)

---

### 4.2 API y Contratos Frontend/Backend

**Campos Coherentes:**
- ✅ `Product.title`, `Product.aliexpressPrice`, `Product.status`
- ✅ `Sale.salePrice`, `Sale.status`, `Sale.marketplace`
- ✅ `OpportunityItem.title`, `costUsd`, `suggestedPriceUsd`, `profitMargin`

**Inconsistencias Detectadas:**

1. **Campo de imagen en oportunidades:**
   - Backend: `image`, `imageUrl`
   - Frontend: Esperaba `image`
   - Estado: Corregido recientemente

2. **Mensajes de error:**
   - Backend: A veces retorna `error`, a veces `message`
   - Frontend: Maneja ambos pero inconsistente
   - Impacto: Medio (UX)

3. **Response format:**
   - Algunos endpoints retornan `{ success: true, data: {...} }`
   - Otros retornan directamente el objeto
   - Impacto: Bajo (funciona pero inconsistente)

---

### 4.3 Estados y Transiciones

**Productos:**
```
PENDING → APPROVED → PUBLISHED
PENDING → REJECTED
PUBLISHED → INACTIVE
```

**Validación:**
- ✅ Transiciones válidas implementadas
- ⚠️ Falta validación estricta en algunos lugares

**Ventas:**
```
PENDING → PROCESSING → SHIPPED → DELIVERED
PENDING → CANCELLED
```

**Validación:**
- ✅ Transiciones válidas implementadas
- ⚠️ No hay validación de que no se pueda retroceder

---

## 5. RECORRIDOS E2E (FUNCIONALES)

### 5.1 Flujo Usuario - Dropshipping Manual

**Pasos según Manual:**
1. ✅ Login → `POST /api/auth/login`
2. ✅ Configurar APIs → `POST /api/marketplace/credentials`
3. ✅ Buscar oportunidades → `POST /api/opportunities/search`
4. ✅ Importar producto → `POST /api/products`
5. ✅ Aprobar producto → `POST /api/publisher/approve/:id`
6. ✅ Publicar → Ya incluido en aprobación
7. ✅ Registrar venta → `POST /api/sales`
8. ✅ Ver comisiones → `GET /api/commissions`
9. ✅ Ver dashboard → `GET /api/dashboard`

**Puntos de Rotura Detectados:**

1. **Q1: Imágenes en oportunidades**
   - Estado: Corregido recientemente
   - Impacto: Medio (ahora funciona)

2. **Q2: Validación de credenciales antes de publicar**
   - Estado: Implementado recientemente
   - Impacto: Alto (evita errores)

3. **Q3: Feedback en publicación**
   - Estado: Mejorado recientemente (publishResults)
   - Impacto: Medio (UX mejorada)

**Flujo Completo:** ✅ FUNCIONAL (después de correcciones recientes)

---

### 5.2 Flujo Usuario - Autopilot / Workflows

**Pasos según Manual:**
1. ✅ Configurar UserWorkflowConfig → `PUT /api/workflow/config`
2. ✅ Crear workflow personalizado → `POST /api/autopilot/workflows` (NUEVO)
3. ✅ Iniciar autopilot → `POST /api/autopilot/start`
4. ⚠️ Verificar que respeta capital → Implementado pero requiere validación
5. ⚠️ Procesamiento automático → Funcional pero limitado

**Puntos de Rotura Detectados:**

1. **Q4: Workflows personalizados no validados E2E**
   - Estado: Recién implementado
   - Impacto: Alto (no probado completamente)
   - Archivos: `workflow.service.ts`, `workflow-executor.service.ts`, `workflow-scheduler.service.ts`

2. **Q5: Scheduler puede no ejecutar workflows programados**
   - Estado: Implementado pero no validado
   - Impacto: Alto (funcionalidad crítica no probada)
   - Archivo: `workflow-scheduler.service.ts`

3. **Q6: Autopilot básico vs workflows personalizados pueden conflictar**
   - Estado: Requiere validación
   - Impacto: Medio (pueden interferir)
   - Nota: Deberían ser independientes

**Flujo Completo:** ⚠️ FUNCIONAL CON RESERVAS (requiere validación E2E)

---

### 5.3 Flujo Admin

**Pasos según Manual:**
1. ✅ Login como admin → Mismo login, verificación de rol
2. ✅ Crear usuario → `POST /api/users`
3. ✅ Ver paneles globales → `GET /api/admin/stats`
4. ✅ Ver comisiones → `GET /api/commissions` (sin filtro userId)
5. ✅ Aprobar solicitudes → `POST /api/access-requests/:id/approve`

**Puntos de Rotura Detectados:**

1. **Q7: Admin puede ver datos de otros usuarios correctamente**
   - Estado: Implementado
   - Impacto: Alto (seguridad)
   - Validación: Reciente (P0.1)

**Flujo Completo:** ✅ FUNCIONAL

---

## 6. CONSISTENCIA GLOBAL Y CALIDAD

### 6.1 Manejo de Errores

**Backend:**
- ✅ Códigos HTTP coherentes (200, 201, 400, 401, 403, 404, 500)
- ✅ Mensajes de error claros en mayoría de casos
- ⚠️ Algunos errores silenciados en try/catch vacíos
- ⚠️ Formatos de respuesta inconsistentes (`error` vs `message`)

**Frontend:**
- ✅ Manejo básico de errores
- ⚠️ Algunos lugares no muestran errores claramente
- ✅ Toast notifications para errores

**Problemas Detectados:**

- **Q8:** Algunos errores se silencian sin logging
- **Q9:** Formatos de respuesta inconsistentes pueden confundir al frontend

---

### 6.2 Validaciones

**Backend:**
- ✅ Zod schemas en mayoría de endpoints
- ✅ Validación de tipos
- ✅ Validación de ownership

**Frontend:**
- ⚠️ Validación básica en formularios
- ⚠️ Algunos formularios no validan completamente antes de enviar

---

### 6.3 Seguridad y Multi-Tenant

**JWT y Roles:**
- ✅ Middleware `authenticate` en rutas protegidas
- ✅ Middleware `authorize('ADMIN')` donde corresponde
- ✅ Refresh tokens funcionando

**Filtrado por userId:**
- ✅ Implementado en mayoría de servicios
- ✅ Validaciones de ownership agregadas recientemente (P0.1)
- ⚠️ Requiere revisión exhaustiva para asegurar 100% cobertura

**Encriptación:**
- ✅ AES-256-GCM para credenciales
- ✅ Passwords con bcrypt

**Problemas Detectados:**

- **Q10:** No todos los endpoints validan ownership explícitamente (algunos confían en filtrado automático)

---

### 6.4 Nombres y Organización

**Coherencia:**
- ✅ Nombres de servicios coherentes
- ✅ Nombres de rutas coherentes
- ✅ Nombres de modelos Prisma coherentes

**Código Duplicado:**
- ⚠️ Algunos cálculos de precios/márgenes duplicados
- ⚠️ Validaciones repetidas en varios lugares

---

## 7. PROBLEMAS CRÍTICOS DETECTADOS

### 🔴 ALTA PRIORIDAD (Bloquean uso real o demo)

#### **Q1: Workflows Personalizados No Validados E2E**
- **Descripción:** Workflows personalizados recién implementados (FASES 1-7) pero no validados end-to-end
- **Ubicación:** `workflow.service.ts`, `workflow-executor.service.ts`, `workflow-scheduler.service.ts`
- **Impacto:** Alto - Funcionalidad crítica no probada
- **Riesgo:** Workflows pueden fallar silenciosamente en producción
- **Solución:** Ejecutar pruebas E2E completas de creación, programación y ejecución de workflows

#### **Q2: Scheduler de Workflows Puede No Ejecutar Correctamente**
- **Descripción:** `workflow-scheduler.service.ts` inicializa pero no se ha validado que ejecute workflows programados
- **Ubicación:** `backend/src/services/workflow-scheduler.service.ts`, `backend/src/server.ts`
- **Impacto:** Alto - Workflows programados pueden no ejecutarse
- **Riesgo:** Usuario configura workflow programado pero nunca se ejecuta
- **Solución:** Validar que node-cron ejecuta correctamente y que workflows se ejecutan según schedule

#### **Q3: Autopilot Básico vs Workflows Personalizados - Posible Conflicto**
- **Descripción:** Autopilot básico y workflows personalizados pueden ejecutarse simultáneamente sin coordinación
- **Ubicación:** `autopilot.service.ts`, `workflow-executor.service.ts`
- **Impacto:** Medio-Alto - Pueden duplicar trabajo o conflictar
- **Riesgo:** Misma oportunidad procesada dos veces
- **Solución:** Coordinar ejecuciones o asegurar que sean mutuamente excluyentes

#### **Q4: Validación de Credenciales Antes de Publicar No Consistente**
- **Descripción:** Aunque se implementó validación, no todos los flujos la usan
- **Ubicación:** Varios lugares en `marketplace.service.ts`, `publisher.routes.ts`
- **Impacto:** Alto - Publicaciones pueden fallar sin aviso previo
- **Riesgo:** Usuario intenta publicar con credenciales inválidas
- **Solución:** Validación consistente en todos los puntos de entrada

#### **Q5: Sincronización de Precios No Actualiza Marketplaces Reales**
- **Descripción:** `syncProductPrice` actualiza BD pero no APIs de marketplaces
- **Ubicación:** `marketplace.service.ts` (método `syncProductPrice`)
- **Impacto:** Medio - Funcionalidad prometida no completa
- **Riesgo:** Usuario actualiza precio pero no se refleja en marketplace
- **Solución:** Implementar llamadas a APIs de marketplaces para actualizar precios

---

### 🟡 MEDIA PRIORIDAD (Afectan UX o completitud)

#### **Q6: Generación con IA No Siempre se Usa**
- **Descripción:** Backend tiene capacidad de IA pero no siempre se invoca
- **Ubicación:** `marketplace.service.ts` (publicación)
- **Impacto:** Medio - Funcionalidad prometida inconsistente
- **Solución:** Asegurar que IA siempre se use cuando está configurado

#### **Q7: Dashboard Financiero Funcionalidad Limitada**
- **Descripción:** `FinanceDashboard.tsx` existe pero funcionalidad es básica
- **Ubicación:** `frontend/src/pages/FinanceDashboard.tsx`
- **Impacto:** Medio - UI existe pero no cumple expectativas del manual
- **Solución:** Implementar funcionalidades prometidas o marcar claramente como "Coming Soon"

#### **Q8: Gráficas en Dashboard Limitadas**
- **Descripción:** Datos disponibles pero visualización básica
- **Ubicación:** `Dashboard.tsx`
- **Impacto:** Medio - UX no cumple expectativas
- **Solución:** Mejorar visualización de gráficas o usar librería de gráficas

#### **Q9: Búsqueda IA Avanzada No Completamente Integrada**
- **Descripción:** `AIOpportunityFinder.tsx` existe pero backend no completamente integrado
- **Ubicación:** Frontend y backend
- **Impacto:** Medio - Funcionalidad prometida no completa
- **Solución:** Completar integración backend o deshabilitar UI claramente

#### **Q10: Formatos de Respuesta Inconsistentes**
- **Descripción:** Algunos endpoints retornan `{ success: true, data: {...} }`, otros directamente el objeto
- **Ubicación:** Múltiples endpoints
- **Impacto:** Medio - Puede confundir desarrollo futuro
- **Solución:** Estandarizar formato de respuesta

---

### 🟢 BAJA PRIORIDAD (Mejoras)

#### **Q11: Email Notifications Requieren Configuración SMTP**
- **Descripción:** Backend preparado pero requiere configuración
- **Impacto:** Bajo - Funcionalidad opcional
- **Solución:** Documentar configuración o hacer más claro que es opcional

#### **Q12: Webhooks No Configurados**
- **Descripción:** Backend preparado pero requiere setup externo
- **Impacto:** Bajo - Funcionalidad futura
- **Solución:** Documentar o marcar como "Coming Soon"

#### **Q13: Código Duplicado en Cálculos**
- **Descripción:** Algunos cálculos de márgenes/precios duplicados
- **Impacto:** Bajo - Mantenibilidad
- **Solución:** Centralizar en helpers

---

## 8. TOP 10 PROBLEMAS CRÍTICOS (DETALLADOS)

### **Q1: Workflows Personalizados No Validados E2E**

**Qué Pasa:**
- Workflows personalizados fueron implementados (FASES 1-7) pero no se han ejecutado pruebas end-to-end completas
- No se sabe si:
  - Los workflows se guardan correctamente
  - El scheduler los ejecuta según cron
  - El executor funciona correctamente para todos los tipos
  - Los logs se registran

**Por Qué es Grave:**
- Funcionalidad crítica que usuarios esperan usar
- Si falla silenciosamente, usuarios perderán confianza
- Puede causar problemas en producción sin detección

**Qué Cambiar:**
- Ejecutar pruebas E2E completas:
  1. Crear workflow de tipo "search"
  2. Programarlo con cron
  3. Verificar que scheduler lo carga
  4. Esperar ejecución (o forzar)
  5. Verificar logs
  6. Verificar resultados

**Archivos Afectados:**
- `backend/src/services/workflow.service.ts`
- `backend/src/services/workflow-executor.service.ts`
- `backend/src/services/workflow-scheduler.service.ts`
- `backend/src/api/routes/autopilot.routes.ts`
- `frontend/src/pages/Autopilot.tsx`

---

### **Q2: Scheduler de Workflows Puede No Ejecutar Correctamente**

**Qué Pasa:**
- `workflow-scheduler.service.ts` se inicializa en `server.ts`
- Pero no se ha validado que:
  - node-cron ejecute correctamente
  - Workflows se ejecuten según schedule
  - Errores se manejen sin detener scheduler

**Por Qué es Grave:**
- Usuario configura workflow programado pero nunca se ejecuta
- No hay feedback claro de por qué no funciona
- Funcionalidad core no operativa

**Qué Cambiar:**
- Agregar logging extensivo en scheduler
- Validar que cron expressions sean correctas
- Probar ejecución forzada de workflows
- Validar que errores no detengan scheduler

**Archivos Afectados:**
- `backend/src/services/workflow-scheduler.service.ts`
- `backend/src/server.ts`

---

### **Q3: Autopilot Básico vs Workflows Personalizados - Posible Conflicto**

**Qué Pasa:**
- Autopilot básico ejecuta ciclos automáticos
- Workflows personalizados pueden ejecutarse independientemente
- Ambos pueden buscar oportunidades en paralelo
- Pueden duplicar trabajo o conflictar

**Por Qué es Grave:**
- Desperdicio de recursos
- Misma oportunidad procesada dos veces
- Confusión para el usuario

**Qué Cambiar:**
- Coordinar ejecuciones o hacer mutuamente excluyentes
- Documentar claramente la diferencia
- Validar que no haya conflictos

**Archivos Afectados:**
- `backend/src/services/autopilot.service.ts`
- `backend/src/services/workflow-executor.service.ts`

---

### **Q4: Validación de Credenciales No Consistente**

**Qué Pasa:**
- Se implementó `validateMarketplaceCredentials` middleware
- Pero no todos los flujos lo usan
- Algunos intentan publicar sin validar primero

**Por Qué es Grave:**
- Publicaciones fallan sin aviso previo
- Usuario no sabe por qué falló
- Mala UX

**Qué Cambiar:**
- Asegurar validación en TODOS los puntos de publicación
- Validar en frontend también antes de permitir publicar

**Archivos Afectados:**
- `backend/src/api/routes/publisher.routes.ts`
- `backend/src/services/marketplace.service.ts`
- `frontend/src/pages/IntelligentPublisher.tsx`

---

### **Q5: Sincronización de Precios No Actualiza Marketplaces**

**Qué Pasa:**
- `syncProductPrice` actualiza precio en BD
- Pero no actualiza precio en marketplace real (eBay, Amazon, ML)
- Funcionalidad prometida no completa

**Por Qué es Grave:**
- Usuario actualiza precio pero no se refleja
- Listings desactualizados en marketplaces
- Mala experiencia

**Qué Cambiar:**
- Implementar llamadas a APIs de marketplaces:
  - eBay: Update listing
  - Amazon: Update price
  - MercadoLibre: Update listing
- O documentar claramente como "Coming Soon"

**Archivos Afectados:**
- `backend/src/services/marketplace.service.ts` (método `syncProductPrice`)

---

### **Q6: Generación con IA No Siempre se Usa**

**Qué Pasa:**
- Backend tiene servicios de IA (`ai-suggestions.service.ts`, etc.)
- Pero no siempre se invocan al publicar
- Títulos y descripciones pueden no estar optimizados

**Por Qué es Grave:**
- Funcionalidad prometida inconsistente
- Productos publicados sin optimización

**Qué Cambiar:**
- Asegurar que IA siempre se use cuando está configurado
- O documentar cuándo se usa

**Archivos Afectados:**
- `backend/src/services/marketplace.service.ts` (publicación)

---

### **Q7: Dashboard Financiero Funcionalidad Limitada**

**Qué Pasa:**
- `FinanceDashboard.tsx` existe
- Pero funcionalidad es básica comparada con lo que promete el manual
- Faltan gráficas avanzadas, proyecciones, etc.

**Por Qué es Grave:**
- UX no cumple expectativas
- Usuario espera más funcionalidad

**Qué Cambiar:**
- Implementar funcionalidades prometidas
- O marcar claramente como "Coming Soon"

**Archivos Afectados:**
- `frontend/src/pages/FinanceDashboard.tsx`
- `backend/src/api/routes/finance.routes.ts`

---

### **Q8: Búsqueda IA Avanzada No Completamente Integrada**

**Qué Pasa:**
- `AIOpportunityFinder.tsx` existe en frontend
- Pero backend no tiene endpoints completamente integrados
- Funcionalidad limitada

**Por Qué es Grave:**
- UI existe pero no funciona completamente
- Confusión para usuario

**Qué Cambiar:**
- Completar integración backend
- O deshabilitar UI claramente

**Archivos Afectados:**
- `frontend/src/components/AIOpportunityFinder.tsx`
- Backend (servicios de IA)

---

### **Q9: Manejo de Errores Inconsistente**

**Qué Pasa:**
- Algunos errores se silencian
- Formatos de respuesta inconsistentes
- Mensajes no siempre claros

**Por Qué es Grave:**
- Debugging difícil
- Usuario no entiende qué pasó

**Qué Cambiar:**
- Estandarizar manejo de errores
- Siempre loguear errores
- Mensajes claros y consistentes

**Archivos Afectados:**
- Múltiples archivos backend y frontend

---

### **Q10: Validación de Ownership No 100% Consistente**

**Qué Pasa:**
- Se mejoró multi-tenant security (P0.1)
- Pero algunos endpoints pueden no validar ownership explícitamente
- Confían en filtrado automático que puede fallar

**Por Qué es Grave:**
- Riesgo de seguridad
- Usuario puede acceder a datos de otros

**Qué Cambiar:**
- Auditoría completa de todos los endpoints
- Validación explícita de ownership siempre
- Tests de seguridad

**Archivos Afectados:**
- Todos los servicios y rutas

---

## 9. TABLA DE PROBLEMAS PRIORIZADA

| ID | Descripción | Tipo | Impacto | Área | Archivos |
|----|-------------|------|---------|------|----------|
| Q1 | Workflows personalizados no validados E2E | Falta validación | Alto | Backend | workflow*.service.ts, autopilot.routes.ts |
| Q2 | Scheduler puede no ejecutar workflows | Bug potencial | Alto | Backend | workflow-scheduler.service.ts, server.ts |
| Q3 | Autopilot vs workflows pueden conflictar | Inconsistencia | Medio-Alto | Backend | autopilot.service.ts, workflow-executor.service.ts |
| Q4 | Validación credenciales no consistente | Falta funcionalidad | Alto | Backend | marketplace.service.ts, publisher.routes.ts |
| Q5 | Sincronización precios no actualiza APIs | Incompleto | Medio | Backend | marketplace.service.ts |
| Q6 | IA no siempre se usa | Inconsistencia | Medio | Backend | marketplace.service.ts |
| Q7 | Dashboard financiero limitado | UX | Medio | Frontend | FinanceDashboard.tsx |
| Q8 | Gráficas limitadas | UX | Medio | Frontend | Dashboard.tsx |
| Q9 | Búsqueda IA no integrada | Incompleto | Medio | Full-stack | AIOpportunityFinder.tsx, backend |
| Q10 | Validación ownership no 100% | Seguridad | Alto | Backend | Todos los servicios |
| Q11 | Email requiere SMTP | Configuración | Bajo | Backend | email.service.ts |
| Q12 | Webhooks no configurados | Configuración | Bajo | Backend | webhooks.routes.ts |
| Q13 | Código duplicado | Mantenibilidad | Bajo | Backend | Múltiples |

---

## 10. RESUMEN EJECUTIVO FINAL

### ¿El Sistema es Usable End-to-End?

#### **Dropshipping Manual (Sandbox):**
✅ **SÍ, FUNCIONAL** - Usuario puede:
- Configurar APIs
- Buscar oportunidades
- Importar productos
- Aprobar y publicar
- Registrar ventas
- Ver comisiones

**Reservas:**
- Validación de credenciales mejorada recientemente
- Imágenes corregidas recientemente

---

#### **Dropshipping Manual (Production):**
⚠️ **FUNCIONAL CON VALIDACIÓN REQUERIDA** - Usuario puede:
- Mismo flujo que sandbox
- Requiere credenciales válidas de producción

**Reservas:**
- Requiere validar que todas las integraciones funcionen en producción
- OAuth de eBay puede requerir re-autorización

---

#### **Dropshipping Automático (Autopilot):**
⚠️ **FUNCIONAL CON LIMITACIONES** - Usuario puede:
- Configurar autopilot
- Iniciar/detener
- Ver estadísticas
- Ciclos automáticos funcionan

**Reservas:**
- Workflows personalizados no validados E2E
- Scheduler puede no ejecutar correctamente
- Posible conflicto con autopilot básico

---

### Alineación con Manual

**Aproximadamente 70-75% alineado:**
- ✅ Funcionalidades core implementadas
- ⚠️ Algunas funcionalidades prometidas incompletas
- ⚠️ Algunas funcionalidades no probadas completamente
- ❌ Algunas funcionalidades avanzadas limitadas

---

## 11. TOP 10 PROBLEMAS CRÍTICOS DETECTADOS

Esta sección detalla los 10 problemas más críticos encontrados durante el análisis, ordenados por impacto y urgencia.

---

### 🔴 PROBLEMA #1: Fallos Parciales de Publicación No Reflejan Estado Real del Producto

**Ubicación:** 
- `backend/src/api/routes/publisher.routes.ts` (líneas 275-334)
- `backend/src/services/marketplace.service.ts` (línea 396-417)

**Problema:**
Cuando se publica un producto a múltiples marketplaces (ej: eBay, Amazon, MercadoLibre):
- Si 2 de 3 marketplaces tienen éxito, el producto se marca como `PUBLISHED` e `isPublished = true`
- Pero si luego 1 marketplace falla, el estado no refleja que solo está publicado en algunos marketplaces
- No hay forma de saber en qué marketplace(s) está realmente publicado

**Impacto:** 
- **ALTO:** Producto aparece como "publicado" pero no está en todos los marketplaces esperados
- Usuario cree que está publicado en 3 lugares cuando solo está en 2
- Puede generar confusión y pérdida de oportunidades de venta

**Evidencia del Código:**
```typescript
// publisher.routes.ts (líneas 275-334)
const publishResults = await marketplaceService.publishToMultipleMarketplaces(
  product.userId,
  id,
  marketplaces,
  userEnvironment
);

const successCount = publishResults.filter(r => r.success).length;
if (successCount > 0) {
  // ✅ Producto aprobado
  await productService.updateProductStatusSafely(id, 'APPROVED', false, product.userId);
  // ... pero el estado no refleja parcialidad
}
```

**Solución Propuesta:**
1. Crear campo `publishStatus` en `Product` model: `'NOT_PUBLISHED' | 'PARTIALLY_PUBLISHED' | 'FULLY_PUBLISHED'`
2. Almacenar detalles de publicación en `productData` JSON:
   ```json
   {
     "publicationStatus": {
       "ebay": { "success": true, "listingId": "123", "listingUrl": "..." },
       "amazon": { "success": false, "error": "..." },
       "mercadolibre": { "success": true, "listingId": "456", "listingUrl": "..." }
     }
   }
   ```
3. Actualizar estado según `successCount`:
   - `successCount === 0`: `status = 'APPROVED'`, `publishStatus = 'NOT_PUBLISHED'`
   - `0 < successCount < total`: `status = 'APPROVED'`, `publishStatus = 'PARTIALLY_PUBLISHED'`
   - `successCount === total`: `status = 'PUBLISHED'`, `publishStatus = 'FULLY_PUBLISHED'`
4. Frontend mostrar badges indicando en qué marketplaces está publicado

**Prioridad:** 🔴 **CRÍTICA** (afecta funcionalidad core)

---

### 🔴 PROBLEMA #2: Workflows Personalizados No Validados E2E

**Ubicación:**
- `backend/src/services/workflow-executor.service.ts`
- `backend/src/services/workflow-scheduler.service.ts`
- `backend/src/api/routes/autopilot.routes.ts`

**Problema:**
Los workflows personalizados fueron implementados recientemente (Fases 1-7) pero:
- No hay pruebas E2E que validen que funcionan correctamente
- El scheduler usa `node-cron` pero no está validado que ejecute workflows programados
- Los logs de ejecución existen pero no hay validación de que se guarden correctamente
- Posible conflicto con autopilot básico si ambos intentan publicar el mismo producto

**Impacto:**
- **ALTO:** Funcionalidad nueva y no probada puede fallar en producción
- Usuarios pueden crear workflows que nunca se ejecuten
- Puede haber conflictos con autopilot básico

**Evidencia del Código:**
```typescript
// workflow-scheduler.service.ts (línea 144)
// TODO: Usar timezone del usuario
timezone: 'America/New_York' // Hardcoded, debería usar timezone del usuario

// workflow-executor.service.ts (línea 308)
error: successCount === 0 ? 'Todos los marketplaces fallaron' : undefined
// No hay validación de que logs se guarden correctamente
```

**Solución Propuesta:**
1. Crear suite de tests E2E para workflows:
   - Crear workflow de cada tipo (search, analyze, publish, reprice, custom)
   - Programar con cron expression válida
   - Esperar ejecución automática
   - Validar logs y resultados
2. Validar scheduler:
   - Verificar que `node-cron` funciona en producción
   - Validar ejecución de workflows programados
   - Verificar manejo de errores
3. Prevenir conflictos:
   - Agregar lock/flag para evitar que autopilot y workflows publiquen el mismo producto simultáneamente
4. Usar timezone del usuario en scheduler

**Prioridad:** 🔴 **CRÍTICA** (funcionalidad nueva no validada)

---

### 🔴 PROBLEMA #3: Inconsistencia en Estados de Productos (status vs isPublished)

**Ubicación:**
- `backend/src/services/product.service.ts` (función `updateProductStatusSafely`)
- `backend/src/services/marketplace.service.ts`
- `backend/src/services/autopilot.service.ts`

**Problema:**
Aunque existe `updateProductStatusSafely()` para sincronizar `status` y `isPublished`, hay casos donde:
- Productos pueden quedar con `status = 'PUBLISHED'` pero `isPublished = false`
- O viceversa: `isPublished = true` pero `status = 'PENDING'`
- Esto ocurre especialmente en flujos de error o cuando hay fallos parciales

**Impacto:**
- **MEDIO-ALTO:** Estados inconsistentes pueden causar bugs en queries y filtros
- Productos aparecen como "publicados" cuando no lo están (o viceversa)
- Dificulta debugging y troubleshooting

**Evidencia del Código:**
```typescript
// autopilot.service.ts (líneas 1078-1083)
await productService.updateProductStatusSafely(
  product.id,
  newStatus,
  false, // No está publicado si falló
  currentUserId
);
// Pero si hubo fallo parcial, newStatus podría ser inconsistente
```

**Solución Propuesta:**
1. Hacer `updateProductStatusSafely()` obligatorio para todos los cambios de estado
2. Agregar validación en queries para detectar inconsistencias:
   ```typescript
   // Detectar inconsistencias en queries
   const inconsistent = await prisma.product.findMany({
     where: {
       OR: [
         { status: 'PUBLISHED', isPublished: false },
         { status: { not: 'PUBLISHED' }, isPublished: true }
       ]
     }
   });
   ```
3. Crear script de migración para corregir inconsistencias existentes
4. Agregar constraint en DB (si es posible) o validación en aplicación

**Prioridad:** 🟡 **ALTA** (afecta consistencia de datos)

---

### 🔴 PROBLEMA #4: Falta Validación de Credenciales en Todos los Flujos

**Ubicación:**
- `backend/src/services/autopilot.service.ts` (función `publishToMarketplace`)
- `backend/src/services/workflow-executor.service.ts` (función `executePublishWorkflow`)

**Problema:**
Aunque `publisher.routes.ts` valida credenciales antes de publicar (P0.4), otros flujos no:
- Autopilot intenta publicar sin validar credenciales primero
- Workflows personalizados de tipo "publish" no validan credenciales
- Esto causa errores silenciosos o fallos inesperados

**Impacto:**
- **MEDIO-ALTO:** Autopilot y workflows fallan sin mensaje claro al usuario
- Wastes time y recursos intentando publicar sin credenciales válidas
- Usuario no sabe por qué falló

**Evidencia del Código:**
```typescript
// autopilot.service.ts (línea 1030+)
// No hay validación de credenciales antes de publicar
const publishResult = await this.marketplaceService.publishProduct(currentUserId, {
  productId: product.id,
  marketplace: this.config.targetMarketplace as 'ebay' | 'mercadolibre' | 'amazon',
  // ...
}, currentEnvironment);
```

**Solución Propuesta:**
1. Agregar validación de credenciales en `autopilot.service.ts` antes de publicar:
   ```typescript
   // Validar credenciales antes de intentar publicar
   const credentials = await marketplaceService.getCredentials(
     currentUserId,
     this.config.targetMarketplace,
     currentEnvironment
   );
   if (!credentials || !credentials.isActive || credentials.issues?.length > 0) {
     logger.warn('Autopilot: Missing/invalid credentials, skipping publication');
     // Enviar notificación al usuario
     return { success: false, error: 'Missing/invalid credentials' };
   }
   ```
2. Similar validación en `workflow-executor.service.ts`
3. Enviar notificación al usuario cuando falten credenciales
4. Agregar check al inicio de cada ciclo de autopilot

**Prioridad:** 🟡 **ALTA** (mejora UX y reduce errores)

---

### 🟡 PROBLEMA #5: TODOs en Código Crítico

**Ubicación:**
- `backend/src/services/workflow-scheduler.service.ts` (línea 144): `// TODO: Usar timezone del usuario`
- `backend/src/services/marketplace.service.ts` (líneas 844, 918, 928): TODOs en sincronización de precios

**Problema:**
Hay TODOs en código que está en producción:
- Timezone hardcoded en scheduler
- Funcionalidades de sincronización de precios incompletas (marcadas con TODO)

**Impacto:**
- **MEDIO:** Funcionalidades incompletas pueden confundir a usuarios
- Timezone incorrecto puede causar ejecuciones a horas equivocadas

**Solución Propuesta:**
1. Implementar timezone del usuario en scheduler
2. Completar sincronización de precios o documentar claramente como "Coming Soon"
3. Crear issue tracker para TODOs restantes
4. Priorizar TODOs por impacto

**Prioridad:** 🟡 **MEDIA** (mejora calidad de código)

---

### 🟡 PROBLEMA #6: Manejo de Errores Inconsistente

**Ubicación:**
- Múltiples archivos usan `console.error` en lugar de `logger`
- Algunos errores se silencian sin notificar al usuario

**Problema:**
- `job.service.ts` usa `console.error` en lugar de `logger` estructurado
- Errores en workflows pueden no notificarse al usuario
- Falta consistencia en códigos HTTP de error

**Impacto:**
- **MEDIO:** Dificulta debugging y monitoreo
- Usuarios no reciben feedback claro cuando algo falla

**Solución Propuesta:**
1. Reemplazar todos los `console.error` con `logger.error` estructurado
2. Estandarizar códigos HTTP de error
3. Asegurar que errores críticos notifiquen al usuario

**Prioridad:** 🟡 **MEDIA** (mejora debugging y UX)

---

### 🟡 PROBLEMA #7: Falta Validación de Precios en Algunos Flujos

**Ubicación:**
- `backend/src/services/autopilot.service.ts` (creación de productos)
- `backend/src/api/routes/products.routes.ts` (creación manual)

**Problema:**
Aunque `marketplace.service.ts` valida que `price > aliexpressPrice`, algunos flujos permiten crear productos con precios inválidos:
- Autopilot puede crear productos con `suggestedPrice <= aliexpressPrice`
- Creación manual de productos no valida esto

**Impacto:**
- **MEDIO:** Productos con precios no rentables pueden crearse
- Luego fallan al intentar publicar

**Solución Propuesta:**
1. Validar `suggestedPrice > aliexpressPrice` en creación de productos
2. Validar en autopilot antes de crear productos
3. Frontend mostrar advertencia si precio no es rentable

**Prioridad:** 🟡 **MEDIA** (previene errores)

---

### 🟡 PROBLEMA #8: Falta Caché de Conversiones de Moneda

**Ubicación:**
- `backend/src/services/fx.service.ts`

**Problema:**
Las conversiones de moneda se hacen en cada request sin caché:
- Múltiples productos en una lista = múltiples llamadas a API de tasas
- Tasas de cambio cambian lentamente (cada hora o menos frecuente)
- No hay caché Redis para tasas de cambio

**Impacto:**
- **BAJO-MEDIO:** Performance lenta al cargar listas de productos
- Posible rate limiting de API de tasas de cambio

**Solución Propuesta:**
1. Implementar caché Redis para tasas de cambio (TTL: 1 hora)
2. Cachear resultados de conversiones frecuentes
3. Invalidar caché cuando se actualicen tasas manualmente

**Prioridad:** 🟢 **BAJA** (optimización de performance)

---

### 🟢 PROBLEMA #9: Falta Validación de Cron Expressions en Frontend

**Ubicación:**
- `frontend/src/pages/Autopilot.tsx` (formulario de workflow)

**Problema:**
El frontend permite ingresar cron expressions pero:
- No valida formato antes de enviar al backend
- No muestra preview de próximas ejecuciones
- Usuario puede crear workflows con cron inválido sin saberlo

**Impacto:**
- **BAJO:** UX mejorable, pero backend valida y rechaza si es inválido

**Solución Propuesta:**
1. Validar formato cron en frontend antes de enviar
2. Mostrar preview de próximas 5 ejecuciones
3. Usar librería como `cronstrue` para mostrar descripción humana

**Prioridad:** 🟢 **BAJA** (mejora UX)

---

### 🟢 PROBLEMA #10: Falta Documentación de APIs Internas

**Ubicación:**
- Servicios internos no tienen documentación JSDoc completa
- Endpoints no documentados con Swagger/OpenAPI

**Problema:**
- Nuevos desarrolladores tienen dificultad entendiendo el código
- No hay documentación API para integraciones externas

**Impacto:**
- **BAJO:** Dificulta mantenimiento y onboarding

**Solución Propuesta:**
1. Agregar JSDoc a todos los servicios
2. Implementar Swagger/OpenAPI para endpoints
3. Crear guía de desarrollo para nuevos desarrolladores

**Prioridad:** 🟢 **BAJA** (mejora mantenibilidad)

---

## 12. RECOMENDACIONES DE SIGUIENTE PASO

### Fase 1: Validación Crítica (Prioridad 0)

1. **Validar Workflows Personalizados E2E**
   - Crear workflow de cada tipo
   - Programar con cron
   - Validar ejecución
   - Verificar logs

2. **Validar Scheduler**
   - Verificar que node-cron funciona
   - Validar ejecución de workflows programados
   - Verificar manejo de errores

3. **Validar No Conflictos Autopilot vs Workflows**
   - Ejecutar ambos simultáneamente
   - Verificar que no duplican trabajo

---

### Fase 2: Correcciones Críticas (Prioridad 1)

1. **Asegurar Validación de Credenciales en Todos los Flujos**
2. **Implementar Sincronización de Precios con APIs Reales**
3. **Auditar Validación de Ownership 100%**

---

### Fase 3: Completitud (Prioridad 2)

1. **Completar Dashboard Financiero**
2. **Completar Integración de Búsqueda IA**
3. **Mejorar Gráficas en Dashboard**
4. **Estandarizar Manejo de Errores**

---

### Fase 4: Mejoras (Prioridad 3)

1. **Documentar Configuración Email**
2. **Documentar Configuración Webhooks**
3. **Refactorizar Código Duplicado**

---

## 13. CONCLUSIÓN

El sistema **Ivan Reseller** está **funcional en un 75-80%** para uso básico de dropshipping manual y automático. Las funcionalidades core están implementadas y operativas. Sin embargo, hay **problemas críticos** que deben resolverse antes de:

1. ✅ **Abrir acceso a usuarios reales:** Requiere validación E2E de workflows y scheduler
2. ⚠️ **Presentar a inversionistas:** Requiere completitud de funcionalidades prometidas
3. ✅ **Uso en producción:** Requiere validación exhaustiva de seguridad multi-tenant

### Principales Fortalezas
- Arquitectura sólida y bien estructurada
- Funcionalidades core operativas
- Seguridad básica implementada
- Multi-tenant funcionando

### Principales Debilidades
- Workflows personalizados no validados
- Algunas funcionalidades incompletas
- Inconsistencias menores en manejo de errores
- Falta validación E2E exhaustiva

### Próximos Pasos Recomendados
1. Validar workflows personalizados E2E
2. Validar scheduler de workflows
3. Completar funcionalidades prometidas o documentar como "Coming Soon"
4. Ejecutar auditoría de seguridad completa

---

**Fin del Informe de QA**

*Este informe se actualizará después de implementar correcciones.*

