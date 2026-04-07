# P54 Screen-by-Screen Improvement Backlog

Date: 2026-03-24
Owner: Codex

## P0

### `OrderDetail.tsx`

- Current classification: `partially_canonical`
- Risk: treats `SIMULATED_ORDER_ID` as success
- Fix: remove simulated success path from primary success banner
- Canonical data needed: proof-backed supplier purchase truth only

### `IntelligentPublisher.tsx`

- Current classification: `partially_canonical`
- Risk: `estimatedProfit` still labeled as `Profit`
- Fix: relabel as estimated margin/profit estimate, add live listing state + blocker truth
- Canonical data needed: listing truth, blocker truth, next action

### `PendingPurchases.tsx`

- Current classification: `partially_canonical`
- Risk: `Ganancia Estimada` shown on a fulfillment action surface
- Fix: relabel clearly as estimated margin, foreground supplier purchase state and proof ladder
- Canonical data needed: proof ladder, blocker truth

## P1

### `Autopilot.tsx`

- Current classification: `partially_canonical`
- Risk: legacy workflow story competes with canonical operations truth
- Fix: embed canonical blocker/listing/proof/agent panels and demote raw runtime counts

### `ProductPreview.tsx`

- Current classification: `partially_canonical`
- Risk: estimate-heavy and still uses legacy workflow pipeline
- Fix: replace `ProductWorkflowPipeline` with lifecycle-aligned truth section

### `Dashboard.tsx`

- Current classification: `partially_canonical`
- Risk: too many summary widgets still compete with canonical pages
- Fix: simplify into overview + deep links, demote secondary summaries

### `Orders.tsx`

- Current classification: `partially_canonical`
- Risk: strong order truth but incomplete proof ladder / agent trace context
- Fix: add canonical proof and blocker context

## P2

### `FinanceDashboard.tsx`

- Current classification: `partially_canonical`
- Risk: finance analytics can be misread as realized-profit truth
- Fix: stronger projection vs proof separation and proof ladder embedding

### `Reports.tsx`

- Current classification: `partially_canonical`
- Risk: analytics and predictive success framing can overread as operational truth
- Fix: label as analytics-only and link back to canonical truth pages

### `AdminPanel.tsx`

- Current classification: `partially_canonical`
- Fix: clarify technical/admin purpose and avoid operational duplication

## P3

### `AutopilotLiveWidget.tsx`

- Current classification: `merge_candidate`
- Fix: merge into `Autopilot.tsx` or `ControlCenter.tsx`

### `InventorySummaryCard.tsx`

- Current classification: `merge_candidate`
- Fix: keep only if subordinate to canonical truth panels

### `BalanceSummaryWidget.tsx`

- Current classification: `merge_candidate`
- Fix: keep as finance sublayer, not primary readiness/business truth

### `WorkflowSummaryWidget.tsx`

- Current classification: `removable`
- Fix: deprecate/remove

### `ProductWorkflowPipeline.tsx`

- Current classification: `stale`
- Fix: replace with real lifecycle model

## Low-Priority / Low-Risk

- auth pages
- doc/help pages
- config/API/settings pages
- `NotFound.tsx`

These mostly need containment, not redesign, unless they begin surfacing operational claims.
