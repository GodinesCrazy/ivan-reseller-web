# P54 Duplication / Conflict Map

Date: 2026-03-24
Owner: Codex

## Duplicated Concern: Listing Truth

Current surfaces:

- `ControlCenter.tsx` -> canonical keep
- `SystemStatus.tsx` -> canonical keep
- `Dashboard.tsx` -> keep, but subordinate to canonical contract
- `Products.tsx` -> keep, but separate product vs listing truth
- `IntelligentPublisher.tsx` -> refactor to canonical listing truth
- `ProductPreview.tsx` -> relabel/refactor

Recommendation:

- `canonical_keep`: `ControlCenter.tsx`, `SystemStatus.tsx`
- `merge`: listing truth snippets inside `Dashboard.tsx`, `Products.tsx`
- `relabel`: listing tables inside `IntelligentPublisher.tsx`
- `remove_or_demote`: legacy publication storytelling that lacks live marketplace state

## Duplicated Concern: Blocker Truth

Current surfaces:

- canonical blocker chips/panels in operations truth consumers
- publication pages with partial error messaging
- order pages with operational errors

Conflict:

- not all blockers are surfaced through one canonical code/message/next-action model

Recommendation:

- canonical blocker truth must come from operations truth contract
- local page-specific errors should remain local details, not substitute for canonical blocker state

## Duplicated Concern: Readiness Truth

Current surfaces:

- `SystemStatus.tsx`
- `SalesReadinessPanel.tsx`
- `Dashboard.tsx`
- `Autopilot.tsx`
- legacy workflow helpers

Conflict:

- technical readiness, publication readiness, and business readiness are still too easy to conflate

Recommendation:

- `SystemStatus.tsx` + `SalesReadinessPanel.tsx` stay as technical/readiness sublayer
- remove readiness storytelling from legacy workflow widgets

## Duplicated Concern: Proof Truth

Current surfaces:

- canonical proof ladder panels
- `Sales.tsx`
- `Orders.tsx`
- `OrderDetail.tsx`
- `PendingPurchases.tsx`
- `FinanceDashboard.tsx`

Conflict:

- order/fulfillment progress is visible, but proof of released funds / realized profit is not consistently foregrounded

Recommendation:

- canonical proof ladder stays primary
- order pages provide local operational detail
- finance pages must clearly label projection vs proof

## Duplicated Concern: Automation Truth

Current surfaces:

- `ControlCenter.tsx`
- `Autopilot.tsx`
- `AutopilotLiveWidget.tsx`
- `WorkflowSummaryWidget.tsx`
- `ProductWorkflowPipeline.tsx`

Conflict:

- multiple different automation narratives coexist

Recommendation:

- `canonical_keep`: `ControlCenter.tsx` for operator truth
- `keep_as_runtime_subsurface`: `Autopilot.tsx`
- `merge`: `AutopilotLiveWidget.tsx`
- `remove`: `WorkflowSummaryWidget.tsx`
- `replace`: `ProductWorkflowPipeline.tsx` with lifecycle aligned to canonical truth

## Duplicated Concern: Sales / Profit Truth

Current surfaces:

- `Sales.tsx`
- `FinanceDashboard.tsx`
- `Reports.tsx`
- `PendingPurchases.tsx`
- `ProductPreview.tsx`
- `IntelligentPublisher.tsx`

Conflict:

- estimated margin, forecasted profit, and realized profit proof are still too visually close

Recommendation:

- relabel all estimate surfaces explicitly
- keep realized-profit truth only in proof-backed contexts
- demote predictive/analytics profit to secondary analytical framing

## Highest-Risk Duplicate Surfaces

- `WorkflowSummaryWidget.tsx`
- `ProductWorkflowPipeline.tsx`
- profit/estimate summaries in `IntelligentPublisher.tsx`
- profit/estimate summaries in `PendingPurchases.tsx`
- workflow/runtime storytelling in `Autopilot.tsx` when not paired with canonical blocker/proof truth
