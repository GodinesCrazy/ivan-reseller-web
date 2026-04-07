# P54 Canonical Convergence Target Model

Date: 2026-03-24
Owner: Codex

## Target Frontend Model

The near-final frontend should operate on one dominant truth flow:

backend canonical operations truth
-> shared frontend contract
-> primary operator surfaces
-> page-specific technical or analytical sublayers

## Canonical Primary Pages

These should become the dominant operator truth surfaces:

- `ControlCenter.tsx` -> primary operations console
- `SystemStatus.tsx` -> technical + marketplace health sublayer
- `Products.tsx` -> per-product and per-listing operational table
- `Orders.tsx` -> order ingestion / supplier purchase / fulfillment truth
- `Sales.tsx` -> commercial proof ladder and post-sale progression

## Secondary Pages

These stay useful, but must not invent their own lifecycle truth:

- `Dashboard.tsx` -> compact overview that links into canonical pages
- `Autopilot.tsx` -> runtime automation console, subordinate to canonical operator truth
- `IntelligentPublisher.tsx` -> publishing workbench with canonical listing/blocker embedding
- `ProductPreview.tsx` -> validation/publish-prep detail page with estimate-safe framing
- `FinanceDashboard.tsx` -> finance analytics and capital management, clearly separated from realized-profit proof
- `Reports.tsx` -> analytics-only

## Technical Sublayers

- `Diagnostics.tsx`
- `SalesReadinessPanel.tsx`
- API/config/settings pages

These pages can show connector status, auth state, webhook state, and configuration readiness, but must not stand in for business-state truth.

## Widgets to Deprecate or Replace

- `WorkflowSummaryWidget.tsx`
- `ProductWorkflowPipeline.tsx`

These do not represent the real lifecycle well enough and should not remain first-class operational truth surfaces.

## Canonical Data Flow Rules

### Listing truth

- must come from canonical operations truth contract
- must distinguish local listing state vs external marketplace state

### Blocker truth

- must use blocker code, message, next action, and evidence timestamp

### Proof truth

- must use proof ladder booleans and timestamps
- released funds and realized profit must never be implied from estimates

### Agent trace

- must use canonical trace payload, not generic “automation is running” copy

### Estimates

- estimates remain allowed only when explicitly labeled as estimates
- estimates must not appear as primary operational proof

## Convergence Goal

After convergence, an operator should be able to answer these questions from the UI without cross-referencing conflicting pages:

- what is live right now
- what is blocked right now
- what exact evidence backs that state
- what agents decided
- what proof stage has actually been reached
- what the next human action is, if any
