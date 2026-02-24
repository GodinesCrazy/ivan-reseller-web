# FASE 1 ? MAPEO COMPLETO DEL FRONTEND

**Auditorùa Ivan Reseller ? Cùdigo real (frontend/src/)**

---

## 1. RUTAS (App.tsx)

| Ruta | Componente | Protegida | Notas |
|------|------------|-----------|--------|
| /help | HelpCenterSafe | No | Siempre accesible |
| /login | Login | No | Redirect a /dashboard si autenticado |
| /request-access | RequestAccess | No | |
| /manual-login/:token | ManualLogin | No | |
| /resolve-captcha/:token | ResolveCaptcha | No | |
| /setup-required | SetupRequired | No | |
| / | Layout (wrapper) | Sù | Redirect a /dashboard |
| /onboarding | OnboardingWizard | Sù | |
| /dashboard | Dashboard | Sù | |
| /opportunities | Opportunities | Sù | |
| /opportunities/history | OpportunitiesHistory | Sù | |
| /opportunities/:id | OpportunityDetail | Sù | |
| /autopilot | Autopilot | Sù | |
| /products | Products | Sù | |
| /products/:id/preview | ProductPreview | Sù | |
| /sales | Sales | Sù | |
| /pending-purchases | PendingPurchases | Sù | |
| /orders | Orders | Sù | |
| /orders/:id | OrderDetail | Sù | |
| /checkout | Checkout | Sù | |
| /commissions | Commissions | Sù | |
| /finance | FinanceDashboard | Sù | |
| /flexible | FlexibleDropshipping | Sù | |
| /publisher | IntelligentPublisher | Sù | |
| /jobs | Jobs | Sù | |
| /reports | Reports | Sù | |
| /users | Users | Sù | |
| /regional | RegionalConfig | Sù | |
| /logs | SystemLogs | Sù | |
| /system-status | SystemStatus | Sù | |
| /settings | Settings | Sù | |
| /workflow-config | WorkflowConfig | Sù | |
| /api-config | APIConfiguration | Sù | |
| /api-settings | APISettings | Sù | |
| /api-keys | APIKeys | Sù | |
| /other-credentials | OtherCredentials | Sù | |
| /admin | AdminPanel | Sù | |
| /help/apis | APIDocsList | Sù | |
| /help/apis/:slug | APIDocViewer | Sù | |
| /help/docs | DocsList | Sù | |
| /help/docs/:slug | DocViewer | Sù | |
| /help/investors | InvestorDocsList | Sù | |
| /help/investors/:slug | InvestorDocViewer | Sù | |
| /meeting-room | MeetingRoom | Sù | |
| /diagnostics | Diagnostics | Sù (tambiùn /diagnostics pùblico) | |

---

## 2. PùGINAS CLAVE ? QUù MUESTRAN Y QUù API USAN

### Dashboard (Dashboard.tsx)
- **Muestra:** totalSales, totalProfit, platformCommissionPaid, activeProducts, totalOpportunities, aiSuggestions, automationRules, recentActivity, platformRevenue (admin), trending keywords, backend health.
- **Endpoints:**
  - GET /api/admin/platform-revenue (solo ADMIN)
  - GET /api/health
  - GET /api/dashboard/stats
  - GET /api/dashboard/recent-activity?limit=10
  - GET /api/opportunities/list (page=1, limit=1)
  - GET /api/ai-suggestions (limit=1)
  - GET /api/automation/config
  - getTrendingKeywords() ? GET /api/trends/keywords
- **Si backend falla:** setDataLoadError(true), muestra errores/fallback.

### Opportunities (Opportunities.tsx)
- **Muestra:** Lista de oportunidades, credenciales status, workflow environment, acciones crear producto y publicar.
- **Endpoints:**
  - GET /api/opportunities
  - GET /api/credentials/status
  - GET /api/workflow/environment
  - POST /api/products (crear desde oportunidad)
  - POST /api/marketplace/publish
- **Si falla:** catch y mensajes/estado de error.

### Products (Products.tsx)
- **Muestra:** Lista de productos, acciones aprobar/rechazar/publicar/eliminar.
- **Endpoints:**
  - GET /api/products
  - PATCH /api/products/:id/status (APPROVED|REJECTED|PUBLISHED)
  - DELETE /api/products/:id
- **Si falla:** manejo en catch.

### Autopilot (Autopilot.tsx)
- **Muestra:** Workflows, stats, status, start/stop, CRUD workflows, run workflow.
- **Endpoints:**
  - GET /api/autopilot/workflows
  - GET /api/autopilot/stats
  - GET /api/autopilot/status
  - POST /api/autopilot/start
  - POST /api/autopilot/stop
  - PUT /api/autopilot/workflows/:id
  - POST /api/autopilot/workflows
  - PUT /api/autopilot/workflows/:id/enabled
  - DELETE /api/autopilot/workflows/:id
  - POST /api/autopilot/workflows/:id/run
- **Si falla:** respuestas de API manejadas en UI.

### Settings (Settings.tsx)
- **Muestra:** Configuraciùn general, perfil, credenciales, pending-products-limit, listing-lifetime, test notificaciones.
- **Endpoints:**
  - GET /api/settings
  - GET /api/auth/me
  - GET /api/credentials
  - GET /api/settings/pending-products-limit
  - POST /api/settings/pending-products-limit
  - GET /api/listing-lifetime/config
  - POST /api/listing-lifetime/config
  - POST /api/settings
  - PUT /api/users/:id
  - POST /api/users/:id/password
  - POST /api/notifications/test
- **Si falla:** mensajes de error en formularios.

### APISettings (APISettings.tsx)
- **Muestra:** Configuraciùn de APIs, credenciales por marketplace, OAuth, test APIs, manual auth, audit.
- **Endpoints:** Mùltiples: GET/POST /api/credentials, GET /api/marketplace/credentials, GET /api/credentials/status, GET /api/config-audit, GET /api/marketplace/auth-url/:apiName, POST test, PUT toggle, DELETE credentials, GET /api/manual-auth/:token, POST /api/manual-auth, POST save-cookies, POST /api/system/test-apis, GET /api/credentials/minimum-dropshipping, GET /api/settings/apis.
- **Si falla:** toasts y estados de error.

### OnboardingWizard (OnboardingWizard.tsx)
- **Muestra:** Pasos de onboarding (PayPal, marketplace, etc.).
- **Endpoints:** (vùa onboarding routes) /api/onboarding/* ? status, paypal, connect-marketplace, complete-step, finish.
- **Si falla:** flujo de error del wizard.

### Help (HelpCenterSafe, APIDocsList, DocViewer, etc.)
- **Muestra:** Centro de ayuda, docs API, docs inversores.
- **Endpoints:** GET /api/help/investors, GET /api/help/investors/:slug (y equivalentes para otros docs si existen).
- **Si falla:** fallback UI / error boundary.

---

## 3. SERVICIOS API (frontend/src/services)

| Archivo | Endpoints utilizados | Respuesta esperada |
|---------|----------------------|--------------------|
| api.ts | baseURL desde runtime; interceptor auth (Bearer/localStorage); 401?logout, 502/503 toast | Axios instance |
| dashboard.api.ts | GET /api/dashboard/stats, /api/dashboard/recent-activity, /api/dashboard/charts/sales | DashboardStats, RecentActivity, chart data |
| products.api.ts | GET/POST/PUT/PATCH/DELETE /api/products, POST /api/products/scrape | Product[], Product |
| orders.api.ts | GET /api/orders, GET /api/orders/:id, POST /api/paypal/create-order, POST /api/paypal/capture-order | Order[], CreatePayPalOrderResponse, CapturePayPalOrderResponse |
| auth.api.ts | POST /auth/login, /auth/register, /auth/logout, GET /auth/me | user, token; me ? user |
| trends.api.ts | GET /api/trends/keywords | TrendKeyword[] |

**BUG:** auth.api.ts usa `/auth/login`, `/auth/me`, etc. El backend monta auth en `app.use('/api/auth', authRoutes)` ? rutas reales son `/api/auth/login`, `/api/auth/me`. Con API_BASE_URL = `http://localhost:4000`, las llamadas van a `http://localhost:4000/auth/login` ? **404**. Debe usarse `/api/auth/login` (o baseURL que termine en /api y path `/auth/login`). En producciÛn API_BASE_URL = `/api`, entonces request serÌa `/api` + `/auth/login` = `/api/auth/login` ? **correcto**. En desarrollo con baseURL sin /api, **falla**. Corregir: usar siempre `/api/auth/*` en auth.api.ts.

---

## 4. STORES (Zustand)

| Store | Ubicaciùn | Estado | Uso |
|-------|-----------|--------|-----|
| authStore | stores/authStore.ts | user, token, isAuthenticated, isCheckingAuth | login, logout, clearSession, checkAuth. Persist: user only. |
| authStatusStore | stores/authStatusStore.ts | statuses (marketplace auth), pendingManualSession | fetchStatuses ? GET /api/auth-status; requestRefresh ? POST /api/auth-status/:marketplace/refresh |

---

## 5. HOOKS

| Hook | Archivo | API / efecto |
|------|---------|--------------|
| useSetupCheck | useSetupCheck.ts | GET /api/setup-status ? redirect a /setup-required si aplica |
| useNotifications | useNotifications.ts | POST /api/notifications/test |
| useTheme | useTheme.ts | Sin API (tema local) |
| useCurrency | useCurrency.ts | GET /api/settings (para moneda) |
| useFieldValidation | useFieldValidation.ts | Sin API |

---

## 6. COMPONENTES CON LLAMADAS API

| Componente | Endpoints |
|------------|-----------|
| UniversalSearchDashboard | GET /api/opportunities |
| WorkflowSummaryWidget | GET /api/products |
| WorkflowProgressBar | GET /api/products/:productId/workflow-status |
| ProductWorkflowPipeline | GET /api/products/:productId/workflow-status |
| WorkflowStatusIndicator | GET /api/products/:productId/workflow-status |
| NotificationCenter | POST /api/workflow/continue-stage, POST /api/workflow/handle-guided-action |
| AIOpportunityFinder | GET /api/opportunities, POST /api/products |
| AISuggestionsPanel | GET /api/ai-suggestions, GET /api/ai-suggestions/keywords, POST /api/ai-suggestions/generate, POST /api/ai-suggestions/:id/implement |
| RealOpportunityDashboard | fetch('/api/dashboard') ? **posible inconsistencia:** backend monta dashboard en /api/dashboard/* (stats, etc.), no GET /api/dashboard exacto. |
| APIDashboard (api-configuration) | GET /api/settings/apis, GET /api/credentials |
| ValidationStep (wizard) | POST /api/credentials, GET /api/marketplace/validate/:marketplace |
| OAuthFlowStep | GET /api/marketplace-oauth/start/:marketplace, GET /api/marketplace/credentials/:marketplace |

---

## 7. RESUMEN DE ENDPOINTS FRONTEND (ùNICOS)

- /auth/login, /auth/register, /auth/logout, /auth/me  
- /api/setup-status  
- /api/health, /api/admin/platform-revenue  
- /api/dashboard/stats, /api/dashboard/recent-activity, /api/dashboard/charts/sales  
- /api/opportunities, /api/opportunities/list, /api/opportunities/:id  
- /api/credentials, /api/credentials/status, /api/credentials/:name, /api/credentials/:name/test, etc.  
- /api/workflow/environment, /api/workflow/config, /api/workflow/working-capital, /api/workflow/continue-stage, /api/workflow/handle-guided-action  
- /api/products, /api/products/:id, /api/products/scrape, /api/products/:id/status, /api/products/:id/workflow-status, /api/products/:id/preview  
- /api/marketplace/publish, /api/marketplace/credentials, /api/marketplace/auth-url/:name, /api/marketplace/validate/:marketplace  
- /api/marketplace-oauth/start/:marketplace  
- /api/autopilot/workflows, /api/autopilot/stats, /api/autopilot/status, /api/autopilot/start, /api/autopilot/stop, CRUD workflows, run  
- /api/settings, /api/settings/pending-products-limit, /api/settings/apis  
- /api/orders, /api/paypal/create-order, /api/paypal/capture-order  
- /api/sales, /api/sales/stats, /api/sales/pending-purchases  
- /api/ai-suggestions, /api/ai-suggestions/keywords, /api/ai-suggestions/generate, /api/ai-suggestions/:id/implement  
- /api/automation/config  
- /api/auth-status, /api/auth-status/:marketplace/refresh  
- /api/admin/* (dashboard, platform-config, platform-revenue, users, commissions, access-requests, charges)  
- /api/publisher/pending, /api/publisher/listings, /api/publisher/approve/:id, /api/publisher/send_for_approval/:id, add_for_approval  
- /api/jobs/publishing  
- /api/finance/summary, breakdown, cashflow, tax-summary, export  
- /api/listing-lifetime/config, /api/listing-lifetime/product/:id  
- /api/notifications/test  
- /api/regional/configs  
- /api/meeting-room/availability, create, :id/end  
- /api/access-requests, approve, reject  
- /api/config-audit  
- /api/manual-auth/:token, POST /api/manual-auth, save-cookies  
- /api/system/test-apis  
- /api/trends/keywords  
- /api/help/investors, /api/help/investors/:slug  
- /api/reports/executive, /api/reports/:tab  
- /api/operations/success-stats, /api/operations/learning-patterns  
- /health, /ready, /version, /config (Diagnostics)

---

## 8. POSIBLES INCONSISTENCIAS DETECTADAS (A VERIFICAR EN FASE 3)

1. **auth.api.ts** usa `/auth/login`, `/auth/me`. Backend monta auth en `app.use('/api/auth', authRoutes)` ? rutas reales son `/api/auth/login`, `/api/auth/me`. Si baseURL es `http://localhost:4000` y no incluye /api, entonces api.ts podrùa estar enviando a /auth/login (sin /api) ? 404. **Verificar runtime.ts (API_BASE_URL) y si existe mount en /auth sin /api.**
2. **RealOpportunityDashboard** usa `fetch('/api/dashboard')`; backend tiene /api/dashboard/stats, /api/dashboard/recent-activity, etc., pero no necesariamente GET /api/dashboard. **Verificar si existe GET /api/dashboard.**
3. **Reports** usa `fetch('/api/reports/...')` y `api.get('/api/operations/...')` ? verificar que existan esos endpoints en backend.

---

*Documento generado a partir del cùdigo real. Fase 2 (backend map) y Fase 3 (alignment) validarùn endpoints y corregirùn discrepancias.*
