# P54 Full Agent Traceability Audit

Date: 2026-03-24
Owner: Codex

## Traceability Standard

An agent-driven surface should ideally show:

- agent name
- stage
- decision
- reason code
- evidence summary
- blocking vs advisory
- next action
- decidedAt

## Surfaces With Good Traceability

### `ControlCenter.tsx`

- Uses canonical agent trace panel
- Shows decision + evidence + next action
- Classification: `good`

### `SystemStatus.tsx`

- Uses canonical agent trace panel
- Keeps technical vs operational state separated
- Classification: `good`

### Canonical helper panels

- `AgentDecisionTracePanel.tsx`
- `OperationsTruthSummaryPanel.tsx`

Classification: `good`

## Surfaces With Partial Traceability

### `Dashboard.tsx`

- Canonical agent trace is present
- But page still competes with non-trace summary widgets
- Classification: `partial`

### `Products.tsx`

- Surfaces some agent-driven operational truth per product
- Still lacks a uniformly rich trace block across all rows
- Classification: `partial`

### `Sales.tsx`

- Shows proof ladder and operational summaries
- Agent action visibility is not yet a central organizing layer
- Classification: `partial`

### `Autopilot.tsx`

- Shows automation runtime, phases, and workflow movement
- But not a canonical decision/evidence trace
- Risks generic automation narrative
- Classification: `partial`

### `IntelligentPublisher.tsx`

- Shows publishing queue/action state
- Missing canonical agent reason/evidence/blocker trace
- Classification: `partial`

### `OrderDetail.tsx` and `Orders.tsx`

- Shows operational actions and errors
- Missing canonical agent trace model for fulfillment and remediation decisions
- Classification: `partial`

## Surfaces With Weak or Missing Traceability

- `ProductPreview.tsx`
- `PendingPurchases.tsx`
- `FinanceDashboard.tsx`
- `Reports.tsx`
- legacy helper workflow widgets

These pages may reference system behavior, automation, or forecasts without exposing the exact agent decision record behind them.

## Fake or Generic Automation Narrative Risks

Strongest remaining risks:

- `Autopilot.tsx` can read as “automation is progressing” without enough decision evidence
- `ProductWorkflowPipeline.tsx` gives a workflow story but not a real decision trace
- analytics/profit pages can imply autonomous performance without showing proof-backed agent outcomes

## Audit Conclusion

Agent traceability now exists canonically, but full-page propagation is incomplete. The biggest gap is not absence of traceability infrastructure; it is incomplete adoption outside the refactored primary truth pages.
