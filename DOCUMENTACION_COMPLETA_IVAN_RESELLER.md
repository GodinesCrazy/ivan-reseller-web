# DOCUMENTACIÓN ÚNICA ? IVAN RESELLER

**Proyecto:** Ivan Reseller Web  
**Descripción:** Plataforma de dropshipping automatizado multi-marketplace (Node.js + React + TypeScript).  
**Última actualización:** Febrero 2026

---

## 1. UBICACIÓN Y ESTRUCTURA DEL PROYECTO

### 1.1 Ubicación

- **Repositorio / workspace:** `c:\Ivan_Reseller_Web` (o ruta equivalente según clonado).
- **Backend:** `backend/` ? API Node.js + Express + TypeScript.
- **Frontend:** `frontend/` ? SPA React + Vite + TypeScript.
- **Base de datos:** PostgreSQL (Prisma); URL en `DATABASE_URL`.

### 1.2 Árbol de directorios principal

```
Ivan_Reseller_Web/
??? backend/
?   ??? prisma/
?   ?   ??? schema.prisma       # Modelos y migraciones
?   ?   ??? migrations/
?   ??? scripts/                # Scripts npm (tests, certs, verificación)
?   ??? security/               # Certificados Payoneer (payoneer.key, payoneer.crt)
?   ??? src/
?   ?   ??? api/
?   ?   ?   ??? routes/         # Rutas Express por dominio
?   ?   ?   ??? handlers/
?   ?   ??? config/             # DB, logger, env, swagger
?   ?   ??? middleware/         # Auth, errores, rate limit, etc.
?   ?   ??? services/           # Lógica de negocio (autopilot, eBay, PayPal, Payoneer, etc.)
?   ?   ??? utils/              # Helpers (certificados, decimales, etc.)
?   ?   ??? modules/            # Módulos (aliexpress, profitability)
?   ?   ??? app.ts              # Express app y montaje de rutas
?   ?   ??? server-bootstrap.ts # Arranque del servidor
?   ?   ??? autopilot-init.ts   # Inicialización del Autopilot
?   ??? package.json
?   ??? .env / .env.example
?
??? frontend/
?   ??? src/
?   ?   ??? pages/              # Páginas (Dashboard, Products, Autopilot, etc.)
?   ?   ??? components/         # Componentes reutilizables y layout
?   ?   ??? stores/             # Zustand (auth, etc.)
?   ?   ??? services/           # Llamadas API
?   ?   ??? hooks/
?   ?   ??? App.tsx
?   ?   ??? main.tsx
?   ??? package.json
?   ??? .env / .env.example
?
??? docs/                       # Documentación adicional
??? README.md
??? AUDIT_REPORT_FINAL.md       # Auditoría técnica
??? PRODUCTION_READY_FINAL_REPORT.md
??? FINAL_PAYONEER_AND_SYSTEM_REPORT.md
??? DOCUMENTACION_COMPLETA_IVAN_RESELLER.md  # Este documento
```

---

## 2. STACK TECNOLÓGICO

| Capa        | Tecnología |
|------------|------------|
| Backend    | Node.js ?20, Express 4, TypeScript 5 |
| Frontend   | React 18, Vite 5, TypeScript, TailwindCSS, Zustand, React Query |
| Base de datos | PostgreSQL, Prisma ORM |
| Cache/Jobs | Redis, Bull/BullMQ (opcional) |
| Auth       | JWT (jsonwebtoken), bcrypt |
| APIs externas | AliExpress Affiliate/Dropshipping, eBay, PayPal, Payoneer (parcial) |

---

## 3. BASE DE DATOS (PRISMA)

### 3.1 Modelos principales

- **User** ? Usuarios (admin/user), balance, paypalPayoutEmail, payoneerPayoutEmail, onboarding, roles.
- **Product** ? Productos (aliexpressUrl, precios, status: PENDING|APPROVED|REJECTED|PUBLISHED|INACTIVE, isPublished, publishedAt).
- **Sale** ? Ventas (orderId, marketplace, salePrice, aliexpressCost, comisiones, trackingNumber, adminPayoutId, userPayoutId).
- **Order** ? Órdenes de checkout (PayPal ? fulfillment): status CREATED|PAID|PURCHASING|PURCHASED|FAILED.
- **Commission** ? Comisiones por venta (usuario/admin).
- **ApiCredential** ? Credenciales por usuario (apiName: ebay, paypal, aliexpress, etc.), environment, credentials JSON.
- **MarketplaceListing** ? Listados en marketplaces (listingId, listingUrl, publishedAt).
- **Opportunity** ? Oportunidades de negocio (costUsd, suggestedPriceUsd, profitMargin, roiPercentage, status).
- **UserWorkflowConfig** ? Configuración de workflow por usuario (environment, workflowMode, stageScrape/Analyze/Publish/etc.).
- **SystemConfig** ? Configuración global (clave-valor JSON), p. ej. autopilot_config, autopilot_stats.
- **AutopilotCycleLog** ? Logs de ciclos del autopilot.
- **PurchaseLog** ? Logs de compras al proveedor.
- **PayoneerAccount** ? Cuenta Payoneer (accountId, balance, currency); opcional.
- **PlatformConfig** ? Comisión plataforma, adminPaypalEmail.
- Otros: Activity, AdminCommission, SuccessfulOperation, AISuggestion, ReportHistory, MeetingRoom, RefreshToken, etc.

### 3.2 Comandos Prisma

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name nombre_cambio
npx prisma migrate deploy
npx prisma studio
npx prisma db seed
```

---

## 4. BACKEND ? RUTAS API (EXPRESS)

Montaje bajo `/api` (desde `app.ts`):

| Prefijo | Descripción |
|---------|-------------|
| `/api/auth` | Login, registro, /me |
| `/api/users` | CRUD usuarios |
| `/api/products` | Productos, publicar |
| `/api/sales` | Ventas |
| `/api/commissions` | Comisiones |
| `/api/dashboard` | Estadísticas |
| `/api/opportunities` | Búsqueda y gestión de oportunidades |
| `/api/autopilot` | Estado, start, stop, run-cycle |
| `/api/marketplace` | Acciones marketplace |
| `/api/marketplace-oauth` | OAuth eBay (authorize/ebay, oauth/callback/ebay) |
| `/api/orders` | Órdenes de checkout |
| `/api/paypal` | Checkout y callbacks PayPal |
| `/api/system` | diagnostics, full-diagnostics |
| `/api/workflow` | Configuración de workflow |
| `/api/onboarding` | Onboarding usuario |
| `/api/credentials` | Credenciales API (UI) |
| `/api/admin` | Panel admin, comisiones |
| `/api/reports`, `/api/notifications`, `/api/jobs` | Reportes, notificaciones, jobs |
| `/api/aliexpress` | Módulo AliExpress |
| `/api/trends`, `/api/profitability` | Tendencias y rentabilidad |
| `/api/internal` | Endpoints internos (test ciclo completo, etc.) |
| `/api/diag`, `/api/debug` | Diagnóstico y debug |

### 4.1 Endpoints de diagnóstico

- **GET /api/system/diagnostics** ? Estado de autopilot, ebayOAuth, aliexpressOAuth, paypal, payoneer, payoneerCertificate, database, scheduler, lastCycle, productsPublished, production_ready.
- **GET /api/system/full-diagnostics** ? system, database, autopilot, aliexpress, ebayOAuth, payoneer, certificate, scheduler, lastCycle, productsInDatabase, productsPublished.
- **GET /health** ? Liveness (200).
- **GET /ready** ? Readiness (200 si DB conectada, 503 si no).

---

## 5. BACKEND ? SERVICIOS (LÓGICA DE NEGOCIO)

| Servicio | Responsabilidad |
|----------|-----------------|
| **autopilot.service** | start(), runSingleCycle(), scheduleNextCycle(); búsqueda de oportunidades, procesamiento, publicación; persistencia en SystemConfig y AutopilotCycleLog. |
| **opportunity-finder.service** | Búsqueda de oportunidades (AliExpress Affiliate API + fallback scraping). |
| **marketplace.service** | getCredentials, publishProduct, publishToMultipleMarketplaces, updateProductMarketplaceInfo; integración con eBay. |
| **ebay.service** | createInventoryItem, createListing (offer + publish); Bearer token. |
| **credentials-manager.service** | getCredentials, saveCredentials; tabla api_credentials. |
| **sale.service** | createSale, createSaleFromOrder; payouts PayPal (admin + usuario); opción Payoneer si PAYOUT_PROVIDER=payoneer. |
| **paypal-checkout.service** | createOrder, captureOrder (checkout). |
| **paypal-payout.service** | sendPayout (comisiones y ganancias). |
| **payoneer.service** | receivePayment, withdrawFunds, getBalance (stub); certificado cliente en backend/security; ensureCertificate(), hasCertificate(). |
| **order-fulfillment.service** | fulfillOrder: Order PAID ? PURCHASING ? attemptPurchase (AliExpress) ? PURCHASED ? createSaleFromOrder. |
| **purchase-retry.service** | attemptPurchase (compra al proveedor). |
| **workflow-config.service** | Configuración de workflow por usuario (sandbox/production, etapas manual/automatic/guided). |
| **product.service** | CRUD productos, actualización de estado (PUBLISHED, etc.). |
| **aliexpress-affiliate-api.service** | Búsqueda y detalles de productos (HMAC-SHA256). |
| **aliexpress-oauth.service** / **aliexpress-dropshipping-api.service** | OAuth y API Dropshipping AliExpress. |

---

## 6. FLUJO DE NEGOCIO (DROPSHIPPING)

1. **Oportunidades** ? opportunity-finder (Affiliate/scraping) ? Opportunity.
2. **Productos** ? Aprobación/creación ? Product (PENDING ? APPROVED ? PUBLISHED).
3. **Publicación** ? marketplace.service + ebay.service ? MarketplaceListing, Product.isPublished, publishedAt.
4. **Venta** ? Checkout propio (PayPal) ? Order (CREATED ? PAID).
5. **Fulfillment** ? order-fulfillment: PAID ? PURCHASING ? attemptPurchase (AliExpress) ? PURCHASED ? createSaleFromOrder ? Sale, Commission.
6. **Pagos** ? sale.service: payouts PayPal (admin + usuario); opcional Payoneer para usuario si configurado.
7. **Autopilot** ? runSingleCycle: buscar oportunidades ? filtrar ? aprobar/publicar según workflow y capital.

---

## 7. FRONTEND ? PÁGINAS Y RUTAS

- **Login** ? Inicio de sesión.
- **Dashboard** ? Resumen y métricas.
- **Opportunities / OpportunitiesHistory / OpportunityDetail** ? Oportunidades.
- **Products / ProductPreview** ? Productos y vista previa.
- **Autopilot** ? Estado, start, stop, ejecutar ciclo.
- **Sales / Commissions / FinanceDashboard** ? Ventas y finanzas.
- **Orders / OrderDetail / Checkout / PendingPurchases** ? Órdenes y compras pendientes.
- **Settings / WorkflowConfig** ? Ajustes y workflow.
- **APISettings / APIConfiguration / APIKeys / OtherCredentials** ? Configuración de APIs.
- **Diagnostics / SystemStatus / SystemLogs** ? Diagnóstico y estado.
- **AdminPanel / Users** ? Admin y usuarios.
- **Reports / Jobs / RegionalConfig** ? Reportes, jobs, configuración regional.
- **HelpCenter / DocsList / DocViewer** ? Ayuda y documentación.
- **MeetingRoom / ManualLogin / ResolveCaptcha / RequestAccess** ? Reuniones, login manual, captcha, solicitud de acceso.

---

## 8. CONFIGURACIÓN Y VARIABLES DE ENTORNO

### 8.1 Backend (.env)

- **JWT_SECRET** ? Obligatorio para tokens.
- **DATABASE_URL** ? PostgreSQL.
- **REDIS_URL** ? Opcional (cache/colas).
- **PORT** ? Puerto del API (p. ej. 4000).
- **CORS_ORIGIN** ? Origen permitido para el frontend.
- **EBAY_CLIENT_ID / EBAY_APP_ID**, **EBAY_CLIENT_SECRET / EBAY_CERT_ID** ? eBay OAuth.
- **ALIEXPRESS_APP_KEY**, **ALIEXPRESS_APP_SECRET** ? AliExpress Affiliate/Dropshipping.
- **PAYPAL_CLIENT_ID**, **PAYPAL_CLIENT_SECRET**, **PAYPAL_ENVIRONMENT** ? PayPal.
- **PAYONEER_PROGRAM_ID**, **PAYONEER_API_USERNAME**, **PAYONEER_API_PASSWORD** ? Payoneer (opcional).
- **PAYOUT_PROVIDER** ? `payoneer` para usar Payoneer para payout de usuario cuando esté listo.
- **SCRAPER_API_KEY** o **SCRAPERAPI_KEY** o **ZENROWS_API_KEY** ? Scraping (autopilot).
- **INTERNAL_RUN_SECRET** ? Para endpoints internos (p. ej. test ciclo completo).

### 8.2 Frontend (.env)

- **VITE_API_URL** ? URL base del backend (ej. http://localhost:4000).

---

## 9. MODO DE USO

### 9.1 Desarrollo local

```bash
# Backend
cd backend
npm install
cp .env.example .env   # Editar .env
npx prisma migrate dev
npm run dev            # http://localhost:4000

# Frontend
cd frontend
npm install
cp .env.example .env   # VITE_API_URL al backend
npm run dev            # http://localhost:5173
```

### 9.2 Producción (build)

```bash
# Backend
cd backend
npm run build
npm run start
# o: npm run start:with-migrations
```

```bash
# Frontend
cd frontend
npm run build
npm run preview
```

### 9.3 Scripts útiles (backend)

- **npm run generate:payoneer-cert** ? Genera certificado Payoneer PEM en `backend/security/`.
- **npm run test-production-cycle** ? Prueba ciclo producción (opción `--direct` para ejecución local).
- **npm run test-full-dropshipping-cycle** ? Prueba ciclo completo (requiere INTERNAL_RUN_SECRET si es vía API).
- **npm run run-autopilot-cycle** ? Ejecuta un ciclo de autopilot manualmente.

---

## 10. PAYONEER Y CERTIFICADO

- **Certificado** ? Generado con Node (sin OpenSSL): `backend/src/utils/generatePayoneerCertificatePem.ts`; script: `npm run generate:payoneer-cert`. Salida: `backend/security/payoneer.key`, `backend/security/payoneer.crt`.
- **PayoneerService** ? Carga cert/key si existen; ensureCertificate() puede auto-generar al arrancar/diagnóstico.
- **Diagnóstico** ? payoneerCertificate (OK/MISSING) en /api/system/diagnostics; certificate en /api/system/full-diagnostics.
- **Payout** ? Si PAYOUT_PROVIDER=payoneer y usuario tiene payoneerPayoutEmail, se intenta Payoneer; si no, PayPal.

---

## 11. ESTADO DE AVANCE (AUDITORÍA Y PRODUCCIÓN)

### 11.1 Componentes (AUDIT_REPORT_FINAL / PRODUCTION_READY)

| Componente | Estado |
|------------|--------|
| AliExpress Affiliate / OAuth / Dropshipping | WORKING |
| eBay OAuth y publicación | WORKING |
| PayPal Checkout y Payout | WORKING |
| Payoneer | PARTIAL (servicio + cert; API real pendiente) |
| Autopilot y Scheduler | WORKING |
| Opportunity Finder, Publication Engine, Purchase Engine | WORKING |
| Order tracking y Finance (Sale, Commission, Payout) | WORKING |
| CredentialsManager, MarketplaceService | WORKING |
| Base de datos (Prisma) | WORKING |
| Frontend (Opportunities, Products, Autopilot, Finance, etc.) | WORKING |

### 11.2 Producción

- **PRODUCTION_READY = TRUE** con: env configurados, OAuth eBay completado, UserWorkflowConfig.environment = 'production', productos con imágenes y categoría válida.
- **Pendiente (no bloqueante):** integración real API Payoneer (receivePayment/withdrawFunds/getBalance); detección de ventas vía eBay Orders/Webhook (hoy flujo con checkout propio PayPal).

### 11.3 Documentos de referencia

- **README.md** ? Visión general, inicio rápido, Docker, comandos.
- **AUDIT_REPORT_FINAL.md** ? Estado detallado por componente y fases (OAuth eBay, publicación, autopilot, ciclo post-venta).
- **PRODUCTION_READY_FINAL_REPORT.md** ? Criterios de producción y script de validación.
- **FINAL_PAYONEER_AND_SYSTEM_REPORT.md** ? Payoneer, certificado y diagnóstico.

---

## 12. CONVENCIONES Y BUENAS PRÁCTICAS

- **Commits:** Conventional Commits (feat:, fix:, docs:, etc.).
- **Código:** TypeScript estricto, ESLint, Prettier; nombres PascalCase para componentes, camelCase para funciones/variables.
- **Tests:** Jest (backend), Vitest (frontend); cobertura recomendada en código tocado.
- **Seguridad:** No commitear secretos; JWT_SECRET y APIs en .env; CORS y rate limit configurados.

---

## 13. CONTACTO Y REPOSITORIO

- **Autor:** Ivan Reseller Team.
- **Repositorio:** [ivan_reseller2](https://github.com/GodinesCrazy/ivan_reseller2) (referencia en README).
- **Licencia:** MIT.

---

Quien lea este documento dispone de la visión única del proyecto: ubicación, estructura, stack, base de datos, API, servicios, flujos, frontend, configuración, uso, Payoneer, certificado y estado de avance.
