# Phase 13 — Launch Audit, Fee Intelligence & Autonomous Activation

## Implemented

### 1. Marketplace Listing Compliance Audit (TASK 1)
- **Table:** `listing_audit_actions` — `listingId`, `marketplace`, `actionType`, `reason`, `executed`, `createdAt`
- **Action types:** `title_restructuring`, `attribute_completion`, `description_improvement`, `image_regeneration`, `price_correction`, `category_correction`
- **Service:** `launch-audit.service.ts` → `runListingComplianceAudit(userId?)` — audits MercadoLibre Chile & eBay US listings, creates repair actions for non-compliant (title/description/images/category/margin).
- **API:** `POST /api/system/run-listing-compliance-audit` (auth)

### 2. Marketplace Fee Intelligence Engine (TASK 2)
- **Service:** `marketplace-fee-intelligence.service.ts`
  - **MercadoLibre Chile:** commission % (env `ML_COMMISSION_PCT`, default 12), no listing fee, MercadoPago included; optional fixed cost by CLP tier.
  - **eBay US:** insertion fee (`EBAY_INSERTION_FEE_USD` 0.35), FVF % + per-order (`EBAY_FVF_PCT`, `EBAY_FVF_PER_ORDER_USD`).
- **Returns:** `totalMarketplaceCost`, `totalOperationalCost`, `expectedProfit`, `expectedMarginPercent`, `breakdown`.
- **API:** `GET /api/analytics/fee-intelligence?marketplace=&listingPrice=&supplierCost=` or `?productId=&marketplace=` (auth)

### 3. Profitability Safeguard (TASK 3)
- **Table:** `unprofitable_listing_flags` — `productId`, `marketplace`, `expectedMargin`, `reason`, `createdAt`
- **Env:** `MIN_ALLOWED_MARGIN` (default 5%). If `expectedMarginPercent < MIN_ALLOWED_MARGIN` → do not publish/scale; create flag.
- **Integration:** `marketplace-publish.service.ts` — before each real publish, runs `runFeeIntelligenceAndFlag()`; if `!allowed`, skips product and returns `skipped` with message.

### 4. Frontend Data Integrity (TASK 4)
- Verified: no mocked/fake data in frontend; dashboard and analytics use real backend APIs.

### 5–6. Positioning & Legacy Repair
- Compliance audit produces repair actions; legacy repair can be executed by workers or manual flows that apply `listing_audit_actions` (e.g. title/description/price updates via existing publishers).

### 7. System Health Audit (TASK 7)
- Reuses Phase 12 `runSystemHealthCheck()` — PostgreSQL, Redis, BullMQ, marketplace API, supplier API.

### 8. Profitability Simulation (TASK 8)
- **Service:** `runProfitabilitySimulation(userId?)` — for all ML/eBay listings, runs fee intelligence, counts profitable/unprofitable, builds break-even list.

### 9. System Readiness Check (TASK 9)
- **Service:** `getLaunchReadinessReport(userId?)` — returns `systemReadyForAutonomousOperation` (true/false) combining health + listing compliance + profitability + no alerts.
- **API:** `GET /api/system/launch-readiness` (auth)

### 10. Autonomous Operation Activation (TASK 10)
- Controlled by env `AUTONOMOUS_OPERATION_MODE=true` (set manually after readiness passes). No automatic activation from code; launch report shows `autonomousActivationStatus`: `enabled` | `disabled` | `not_ready`.

### 11. Launch Report (TASK 11)
- **API:** `GET /api/system/launch-report` (auth) — total listings audited, total repaired, profitability summary, fee intelligence analysis, system readiness, autonomous activation status.

## Env (backend)

```env
MIN_ALLOWED_MARGIN=5
ML_COMMISSION_PCT=12
EBAY_INSERTION_FEE_USD=0.35
EBAY_FVF_PCT=13.25
EBAY_FVF_PER_ORDER_USD=0.4
AUTONOMOUS_OPERATION_MODE=false
```

## Migration

Run when the DB has capacity (e.g. after deploy or off-peak):

```bash
cd backend && npx prisma migrate deploy
```

If you get "too many clients already", either retry later or apply manually:

```bash
cd backend && npx tsx scripts/apply-phase13-migration.ts
```

Migration: `20250324000000_phase13_listing_audit_and_unprofitable_flags`

## Configurar env

Copia en tu `.env` (o configura en Railway) las variables Phase 13 de `backend/.env.example`:

- `MIN_ALLOWED_MARGIN=5`
- `ML_COMMISSION_PCT=12`
- `EBAY_INSERTION_FEE_USD=0.35`
- `EBAY_FVF_PCT=13.25`
- `EBAY_FVF_PER_ORDER_USD=0.4`

Cuando el launch-report muestre `systemReadyForAutonomousOperation: true`, añade y reinicia:

- `AUTONOMOUS_OPERATION_MODE=true`

## Probar APIs (con auth)

Con el backend en marcha y un usuario válido:

```bash
cd backend && npx tsx scripts/test-phase13-apis.ts
# o contra producción:
npx tsx scripts/test-phase13-apis.ts https://ivan-reseller-backend-production.up.railway.app
```

Asegura tener `AUTOPILOT_LOGIN_USER` y `AUTOPILOT_LOGIN_PASSWORD` en `.env` (o usa admin/admin por defecto).

Pruebas manuales con token:

- `GET /api/system/launch-readiness` — Header: `Authorization: Bearer <token>`
- `GET /api/system/launch-report`
- `POST /api/system/run-listing-compliance-audit`
- `GET /api/analytics/fee-intelligence?marketplace=ebay&listingPrice=50&supplierCost=25` o `?productId=1&marketplace=ebay`
