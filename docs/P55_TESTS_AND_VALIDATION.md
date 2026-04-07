# P55 — Tests and Validation

## Automated

- **Backend:** `npx tsc -p tsconfig.json --noEmit` — **passed** (exit 0).  
  - Note: `npm run build` failed once with **Prisma EPERM** rename on Windows (`query_engine-windows.dll.node`); environment issue, not P55 code.
- **Frontend:** `npx vitest run src/utils/simulated-order-id.test.ts` — **passed** (3 tests).
- **Frontend full `tsc` / `npm run lint`:** project has **many pre-existing** errors and ESLint config resolution issues when invoked from non-root paths; **not used** as a P55 gate. P55-touched files were reviewed for local TypeScript issues (fixed `unknown` in `IntelligentPublisher`, `Button` `size`, `processing` index typing in `PendingPurchases`).

## Manual verification checklist

- [x] `OrderDetail`: no green success for `SIMULATED` status; no success for `PURCHASED` + `SIMULATED_ORDER_ID`; success only with real ID or manual purchase date.
- [x] `IntelligentPublisher`: pending cards show blocker/listing block **before** estimates.
- [x] `PendingPurchases`: fulfillment column and canonical panels dominate; margin labeled referential.
- [x] `Autopilot`: canonical truth section present; profit cards relabeled as projected/estimated.
- [x] `WorkflowSummaryWidget`: renders nothing.
- [x] `ProductWorkflowPipeline`: passes `environment` into truth fetch.
