# P55 — PendingPurchases Truth Refactor

## Goal

Make the page read as a **fulfillment / control** surface, not a speculative finance screen.

## Changes

- **Header:** link to `/control-center` and explicit note that margin figures are referential.
- **Canonical bundle:** when pending rows include `productId`, fetch `/api/dashboard/operations-truth` for up to 50 IDs and show:
  - `OperationsTruthSummaryPanel`
  - `PostSaleProofLadderPanel` (subset copy explains queue context).
- **Per-card layout:**
  - New first column: **Fulfillment — siguiente acción** with links to order truth and supplier.
  - Buyer block unchanged in purpose, second column.
  - Financial block moved to full-width **demoted** section: “Referencia de costos y capital (no es ganancia realizada)”; **Ganancia Estimada** replaced with **Margen bruto referencial (estimado)** + disclaimer.
- **Types:** `processing` map keyed by string row id to satisfy strict indexing; removed invalid `Button` `size` prop.

## Files

- `frontend/src/pages/PendingPurchases.tsx`
