# Phase 35 — AI Growth Director: Execution Report

**Date:** 2025-03-17  
**Scope:** Phase 1 (Full System Audit – Reality First) and critical fixes for verified real profit.

---

## 1. Data reality validation (TASK 1)

### Already correct

- **Dashboard stats** (`GET /api/dashboard/stats`): Uses `saleService.getSalesStats()`, which applies `SaleService.realSalesFilter(environment)`. In production, orders with `orderId` starting with `test`, `TEST`, `mock`, `demo`, `DEMO` are excluded. **No change needed.**
- **Sales list** (`GET /api/sales`): Uses `saleService.getSales()`. Real-sales filter is applied in the service where relevant. **No change needed.**
- **Real Profit Engine** (`backend/src/services/real-profit-engine.service.ts`): Excludes test/mock/demo by design. Used by `GET /api/finance/real-profit`. **No change needed.**
- **Autopilot / opportunity finder**: Comments state "Real data only; no mock/simulated." **No change needed.**

### Fixed

- **Finance summary and related endpoints** (`backend/src/api/routes/finance.routes.ts`):  
  All aggregations over `prisma.sale` now use `SaleService.realSalesFilter(environment)` in production so that revenue, profit, and counts are **real only**.
  - `GET /api/finance/summary` — main sales and pending sales queries
  - `GET /api/finance/breakdown` — sales by category
  - `GET /api/finance/cashflow` — sales for cashflow
  - `GET /api/finance/tax-summary` — sales for tax summary
  - `GET /api/finance/export/:format` — sales for export (CSV/PDF/Excel)

**Result:** In production, finance UI and exports show only real orders (no test/mock/demo).

---

## 2. Marketplace truth sync & listing status (TASKS 2–3)

- **Documented.** Revisión de componentes y endpoints en [docs/phase35_listing_sync_review.md](phase35_listing_sync_review.md): ListingStateReconciliationService, FullListingAuditService, ListingRecoveryEngine, colas programadas, y endpoints `POST /api/publisher/listings/run-reconciliation-audit`, `run-full-recovery`, `phase30/self-heal`. Para ejecutar: usar el checklist de endpoints o el script `backend/scripts/run-reconciliation-audit.ts`.

---

## 3. Profit validation & cost control (TASKS 4–5)

### Verified

- **Profit formula:** `money_in` (sale price) minus `money_out` (supplier, shipping, marketplace fees, payment fees) is implemented in:
  - `real-profit-engine.service.ts` (real orders only)
  - `financial-calculations.service.ts` (eBay, Amazon, MercadoLibre default fees)
  - `cost-calculator.service.ts` (per-marketplace fees + region overrides)
  - `profit-guard.service.ts` (platform + PayPal fees)
- **Fees:** MercadoLibre, eBay, Amazon, payment, and shipping are considered in the cost/profit pipeline. **No code change.**

### Fix applied

- Finance aggregations now use the same real-sales filter as dashboard and sales, so **profit and ROI in finance are based only on real data** when `environment === 'production'`.

---

## 4. Workers, APIs, Autopilot (TASKS 6–8)

- **Checklist preparado.** Ver [docs/phase35_checklist_workers_apis_autopilot.md](phase35_checklist_workers_apis_autopilot.md): variables (REDIS_URL, SAFE_BOOT, DATABASE_URL, marketplaces, AliExpress), endpoints (readiness-report, phase28/workers-health, phase30/api-health, autopilot/status, autopilot/health) y orden de comprobación. Opcional: ejecutar `backend/scripts/run-phase35-checklist.ts` con BASE_URL y credenciales para obtener un reporte rápido.

---

## 5. Summary of code changes

| File | Change |
|------|--------|
| `backend/src/api/routes/finance.routes.ts` | Import `SaleService`. For all sale-aggregation endpoints, add `SaleService.realSalesFilter(environment)` to `prisma.sale.findMany` `where` so production uses only real orders. |

---

## 6. Recommended next steps (from Phase 35 prompt)

1. **Marketplace sync:** Seguir [phase35_listing_sync_review.md](phase35_listing_sync_review.md); ejecutar `run-reconciliation-audit` y, si aplica, `run-full-recovery` con `verifyWithApi: true` (TASKS 2–3).
2. **Infrastructure:** Seguir [phase35_checklist_workers_apis_autopilot.md](phase35_checklist_workers_apis_autopilot.md) o ejecutar `npx tsx scripts/run-phase35-checklist.ts [BASE_URL]` (TASKS 6–7).
3. **Autopilot:** Verificar con GET `/api/autopilot/status` y `/api/autopilot/health`; ver checklist (TASK 8).
4. **AI Growth Director / decision engine:** Diseñar e implementar capa de decisión central y escalado seguro (TASKS 9–17).
5. **Frontend:** Asegurar que la UI muestre solo datos reales y acciones orientadas a decisiones (TASKS 18–19).
6. **Go-live:** Ejecutar GET `/api/system/phase28/ready` y criterios de TASKS 20–21.

---

**Conclusion:** Phase 1 data reality is enforced for dashboard and sales (already in place) and for **all finance endpoints** (fixed in this run). Profit and cost logic were verified; no corrections were required. Remaining phases (marketplace sync, infrastructure, autopilot, AI director, UI, go-live) are left for future execution.
