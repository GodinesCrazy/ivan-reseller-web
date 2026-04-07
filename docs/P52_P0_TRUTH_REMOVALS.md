## P52 - P0 Truth Removals

### Removed dangerous misleading truth

1. Hardcoded conversion KPI removed from `frontend/src/pages/Sales.tsx`
- Removed the fixed `78%` conversion rate widget.
- Replaced with proof-aware metrics and payout/realized-profit proof counts.

2. Local automation truth removed from `frontend/src/pages/Dashboard.tsx`
- Removed frontend-local `isAutomaticMode` state from the dashboard control surface.
- Replaced with real autopilot runtime status from `/api/autopilot/status`.

3. Frontend-derived workflow summary removed from primary dashboard surface
- Removed `WorkflowSummaryWidget` from `Dashboard.tsx`.
- This reduces conflicting lifecycle narratives on the main operations surface.

4. Generic product profit labeling corrected
- `frontend/src/pages/Products.tsx` now presents:
  - `Margen unitario estimado`
  - not generic `Beneficio`
- Backend now also emits explicit `estimatedUnitMargin` in products routes.

5. Sales profit wording made more truthful
- `frontend/src/pages/Sales.tsx` now uses proof-aware wording:
  - `Margen neto registrado`
  - plus explicit note that it is not realized profit until released-funds proof exists.

### Verification

Dangerous strings removed from primary operational surfaces:

- no hardcoded `78%`
- no `isAutomaticMode` dashboard state
- no `WorkflowSummaryWidget` on dashboard
