# P56 — ProductPreview Truth Refactor

## Goal

Refactor ProductPreview.tsx so it no longer uses legacy lifecycle framing or estimate-heavy presentation as primary operational truth.

## Changes

- **Header:** Added link to Control Center; subtitle clarifies canonical truth lives there and financial data here is pre-publication estimates.
- **ProductWorkflowPipeline:** Kept as canonical lifecycle block; intro comment clarifies P56 alignment.
- **Ganador block:** Relabeled as "Score heurístico 'ganador'" with amber styling; copy explains it is analytic reference, not commercial proof.
- **Lifetime decision:** Added note that gain/ROI metrics are estimated and realized profit requires proof in orders/finance.
- **Financial modal:**
  - Section title → "Rentabilidad estimada (pre-publicación)" with dashed border and neutral colors.
  - "Ganancia potencial (estim.)", "Margen estimado" — demoted from green dominant signal.
  - "Ganancia neta proyectada (estimada)" for fees.netProfit; disclaimer that it is not realized.
  - New "Analytics vs proof" disclaimer box with link to Control Center.
- **ListingPreview interface:** Added optional `winnerDetectedAt` for TypeScript.

## Files

- `frontend/src/pages/ProductPreview.tsx`
