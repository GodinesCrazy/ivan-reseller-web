# Migración a Web — Matriz de Paridad Funcional

Objetivo: clonar el sistema original (Python, `ivan_reseller`) en la plataforma web multiusuario conservando el 100% de funcionalidades, menús y flujos, mejorando únicamente la capa visual.

Convenciones de estado:
- [x] Paridad ya cubierta en la web
- [~] Parcial (existe la base pero faltan endpoints/flujo/datos reales)
- [ ] Pendiente (no existe equivalente aún)

## 1) Menús y Páginas (Original → Web)

- Dashboard general
  - Original: `/dashboard`, `/home`
  - Web: `frontend/src/pages/Dashboard.tsx` [x]

- Admin Multiusuario
  - Original: `/dashboard_admin_multiuser.html`
  - Web: `frontend/src/pages/AdminPanel.tsx` [~] (falta abarcar gestión completa de usuarios/roles/actividades del original)

- Panel Usuario (Multiusuario)
  - Original: `/dashboard_user_multiuser.html`
  - Web: `frontend/src/pages/Dashboard.tsx` [~] (parcial; completar KPIs/acciones específicas de usuario)

- Publicador Inteligente
  - Original: `/dashboard_intelligent_publisher.html`
  - Web: sin equivalente directo [ ] (revisar `publisher` del original y definir vista `IntelligentPublisher.tsx`)

- Gestión de Productos
  - Original: `/dashboard_products.html`
  - Web: `frontend/src/pages/Products.tsx` [~] (falta ciclo de vida completo y aprobaciones)

- Autopilot / Automatización
  - Original: `/dashboard_autopilot.html`
  - Web: `backend/src/routes/automation.routes.ts` y `backend/src/controllers/automation.controller.ts` [~] (falta UI dedicada; crear `Autopilot.tsx`)

- Finanzas
  - Original: `/dashboard_finance.html`
  - Web: sin página dedicada (existe `Reports.tsx` y endpoints de comisiones/ventas) [~] (crear `FinanceDashboard.tsx` con resúmenes/transactions)

- Flexible Dropshipping
  - Original: `/dashboard_flexible_dropshipping.html`
  - Web: no existe vista [ ] (endpoints parciales: flexible service no identificado en web)

- Oportunidades Reales (Enhanced)
  - Original: `/dashboard_opportunities_enhanced.html`
  - Web: `frontend/src/components/RealOpportunityDashboard.tsx` y `AIOpportunityFinder.tsx` [~] (la lógica de competencia real está simulada; ver Sección 3)

- Credenciales/API Keys
  - Original: `/dashboard_credentials_complete.html`
  - Web: `frontend/src/pages/APIConfiguration.tsx` [x] (completar pruebas por marketplace)

- Configuración Regional / “Chilean Abroad”
  - Original: `/dashboard_regional_config.html`, `/dashboard_chilean_abroad.html`
  - Web: sin vista específica [ ] (llevar a página `RegionalConfig.tsx` con soportes de moneda/IVA/envíos)

- Documentación (Manual/Guías)
  - Original: `/MANUAL_USUARIO_FLEXIBLE_GLOBAL_2025.html`, `/GUIA_INICIO_RAPIDO.html`, `/GUIA_ACCESO_EXTRANJERO_2025.html`, `/PRESENTACION_INVERSORES.html`
  - Web: sin equivalentes [ ] (publicar estáticos o convertir a páginas internas)

## 2) APIs y Endpoints (Original → Web)

- Autenticación
  - Original: `/api/auth/login`, `/api/auth/logout`, `/api/auth/verify`
  - Web: `backend/src/api/routes/auth.routes.ts` [x]

- Salud / Sistema / Configuración
  - Original: `/api/health`, `/api/system/features`, `/api/system/detailed-info`, `/api/status`, `/api/config`, `/api/modules`, `/api/test/<module>`
  - Web: `/health` (app), varios endpoints admin/dashboard [~] (consolidar “system” y “config status”)

- Scraping Real (AliExpress + aprendizaje)
  - Original: `/api/scraping/*`, `/api/scraping/aliexpress/search`
  - Web: `backend/src/services/advanced-scraper.service.ts`, `real-scraper.service.ts` [~] (necesario bridge nativo undetected_chromedriver y cascada real)

- Oportunidades Reales
  - Original: `/api/opportunities`
  - Web: scripts `find-real-opportunities.ts`, `search-opportunities.ts`; sin ruta REST dedicada [ ] (crear `opportunities.routes.ts` y orquestador real)

- Publicador / Aprobaciones
  - Original: `/api/publisher/*`
  - Web: no identificado [ ]

- Ciclo de Vida de Producto
  - Original: `/api/lifecycle/*`
  - Web: `products.routes.ts` básico [~] (agregar estados, histórico y acciones keep/process)

- Sugerencias IA
  - Original: `/api/suggestions`
  - Web: `AISuggestionsPanel.tsx` (UI), sin endpoint consolidado [~]

- Credenciales/API Keys
  - Original: `/api/credentials/*`
  - Web: `marketplace.routes.ts`, `amazon.routes.ts`, `notifications.routes.ts` [~] (completar test de credenciales por marketplace)

- Moneda y Tipos de Cambio
  - Original: `/api/currency/*`, `/api/exchange-rates/*`
  - Web: sin módulos dedicados (hay comisiones y reportes) [ ] (crear servicio currency y configuración FX)

- Producción y Operación (health/alerts/audit/recovery/keys/metrics)
  - Original: `/api/production/*`
  - Web: sin equivalente [ ] (migrar observabilidad/keys/rotación)

- Proxies y Captcha
  - Original: `/api/proxies/*`, `/api/captcha/*`
  - Web: sin equivalente [ ]

- Logs SSE
  - Original: `/api/logs/stream`, `/api/logs`
  - Web: `notifications` (WS/eventos) [~] (agregar SSE logs scraping/análisis)

- Webhooks
  - Original: `/webhook/paypal`, `/webhook/ebay`, `/webhook/mercadolibre`
  - Web: no identificados [ ]

- Finanzas
  - Original: `/api/finance/*`, `/api/profit/*`
  - Web: comisiones y ventas (`sale.service.ts`, `commission.service.ts`) [~] (añadir dashboard financiero y profit calc)

- Reportes
  - Original: integrado en varios módulos
  - Web: `backend/src/api/routes/reports.routes.ts` [x]

## 3) Núcleo de Oportunidades Reales (Gap crítico)

- Scraper AliExpress nativo con `undetected_chromedriver`
  - Original: `aliexpress_stealth_scraper.py` (política de “datos reales o nada”) [fuente de verdad]
  - Web: `advanced-scraper.service.ts`/`real-scraper.service.ts` (Puppeteer). Falta bridge nativo y fallback en cascada [~]

- Analizador de Competidores Real
  - Original: `real_market_competitor_analyzer.py` (APIs reales eBay/Amazon/ML; región/idioma; normalización precios) [fuente de verdad]
  - Web: `ai-opportunity.service.ts` simula competencia con `Math.random()` [ ] Reemplazar por servicio real usando `amazon.service.ts`, `ebay.service.ts`, `mercadolibre.service.ts`

- Calculadora de Costos/Fees
  - Original: `real_cost_calculator.py` (comisiones marketplace, pagos, impuestos, shipping) [fuente de verdad]
  - Web: `commission.service.ts` parcial; falta motor de costos parametrizable [~]

- Orquestador de Oportunidades
  - Original: `real_opportunity_finder.py` (scraping → competencia → costos → scoring) [fuente de verdad]
  - Web: scripts de demo; falta servicio y ruta REST `opportunities` [ ]

## 4) Multiusuario, Seguridad y Datos

- Base de datos y credenciales
  - Web: Prisma (`schema.prisma`) con `User`, `ApiCredential`, `Product`, `Sale`, `Commission`, `Activity` [x]
  - Pendiente: `Opportunity`, `CompetitionSnapshot`, `JobRun`, `Notification`, `AuditLog` [ ]

- Autenticación y roles
  - Web: JWT (`auth.routes.ts`, `auth.service.ts`) [x]
  - Pendiente: guardas finas por recurso/tenant y auditoría [~]

## 5) Próximos entregables

1) Bridge Python para Scraping Nativo [criticidad alta]
   - Exponer `aliexpress_stealth_scraper.py` como microservicio local.
   - Crear `backend/src/services/scraper-bridge.service.ts` con fallback real.

2) Servicio Competencia Real
   - Implementar `competitor-analyzer.service.ts` usando `amazon/ebay/mercadolibre` services y credenciales por usuario.

3) Calculadora Costos Real
   - `cost-calculator.service.ts` parametrizable por marketplace/país/moneda.

4) Orquestador y Rutas
   - `opportunity-finder.service.ts` y `api/routes/opportunities.routes.ts` para REST `/api/opportunities`.

5) UI Paritaria
   - Añadir vistas: `Autopilot.tsx`, `FinanceDashboard.tsx`, `IntelligentPublisher.tsx`, `RegionalConfig.tsx`, `FlexibleDropshipping.tsx` y endpoint logs SSE.

6) Esquema DB
   - Extender Prisma con entidades faltantes y migraciones.

7) Observabilidad/Producción
   - Métricas, auditoría, rotación de claves, webhooks.

Este documento se actualizará a medida que alcancemos paridad en cada módulo.

