# P54 Page-by-Page Truth Audit

Date: 2026-03-24
Owner: Codex

## Canonical

### `ControlCenter.tsx`

- Purpose: primary operations console
- Backend truth consumed: canonical operations truth contract plus selected technical endpoints
- Strengths: shows live listing state, blocker truth, proof ladder, agent trace, next action
- Remaining gap: still coexists with some legacy helper narratives elsewhere
- Classification: `canonical`

### `SystemStatus.tsx`

- Purpose: system + marketplace operational health
- Backend truth consumed: canonical operations truth plus connector/system health
- Strengths: no longer reduces truth to booleans only
- Remaining gap: some secondary widgets elsewhere still duplicate readiness
- Classification: `canonical`

## Partially Canonical

### `Dashboard.tsx`

- Purpose: top-level overview
- Backend truth consumed: operations truth plus multiple legacy analytics endpoints
- Truth gaps: mixes canonical truth with summary widgets and finance/analytics signals
- Duplicate truth: inventory, sales readiness, autopilot, finance summaries overlap with ControlCenter/SystemStatus
- Risk: still implies a unified business overview without consistently separating proof vs estimate
- Classification: `partially_canonical`

### `Products.tsx`

- Purpose: product catalog + operational list
- Backend truth consumed: operations truth, workflow batch, post-sale overview, inventory summary
- Strengths: now shows live listing state, sub-status, blocker code, next action
- Truth gaps: still mixes product state, workflow state, and listing state in one dense surface
- Risk: legacy status filtering can still bias operators toward local product status
- Classification: `partially_canonical`

### `Sales.tsx`

- Purpose: sales operations and proof ladder summary
- Backend truth consumed: operations truth plus sales APIs
- Strengths: hardcoded conversion KPI removed; proof ladder visible
- Truth gaps: still blends commercial metrics and operational proof
- Classification: `partially_canonical`

### `Orders.tsx`

- Purpose: real order operations
- Backend truth consumed: real order APIs, sync status, manual actions
- Strengths: strong real-order handling, no mock/demo rows rendered
- Truth gaps: no canonical agent trace, no released-funds/realized-profit boundary, no canonical blocker panel
- Classification: `partially_canonical`

### `OrderDetail.tsx`

- Purpose: detailed fulfillment / post-sale order view
- Backend truth consumed: real order detail endpoints
- Truth gaps: success banner still accepts `SIMULATED_ORDER_ID`
- Risk: can overstate fulfillment truth for historical simulated/test states
- Classification: `partially_canonical`

### `PendingPurchases.tsx`

- Purpose: manual or fallback supplier purchase action queue
- Backend truth consumed: real pending-purchases API
- Truth gaps: highlights `Ganancia Estimada` as a primary financial signal on an operations page
- Missing: proof-ladder framing and explicit distinction between estimated margin vs realized outcome
- Classification: `partially_canonical`

### `IntelligentPublisher.tsx`

- Purpose: publishing queue / listing submission surface
- Backend truth consumed: pending publish APIs, listing APIs, finance capacity APIs
- Truth gaps: still labels `estimatedProfit` as `Profit`; listing rows omit live external state/sub-status/blocker
- Missing: canonical listing truth panel and exact ML blocker visibility
- Classification: `partially_canonical`

### `Autopilot.tsx`

- Purpose: runtime automation console
- Backend truth consumed: autopilot/config/dashboard/runtime endpoints
- Truth gaps: legacy workflow model still dominates; profit and publication counts are shown without canonical listing/blocker/proof framing
- Missing: exact agent decision trace and proof ladder integration
- Classification: `partially_canonical`

### `ProductPreview.tsx`

- Purpose: pre-publication product detail / preview / approval send-off
- Backend truth consumed: preview, listing lifetime, publisher approval endpoints
- Truth gaps: estimate-heavy language (`Ganancia Potencial`, margin, net profit) still dominates
- Duplicate truth: `ProductWorkflowPipeline` keeps a legacy workflow narrative
- Classification: `partially_canonical`

### `FinanceDashboard.tsx`

- Purpose: finance and capital management
- Backend truth consumed: finance summary, cashflow, tax, projections
- Strengths: some estimates are labeled honestly
- Truth gaps: operationally adjacent but not clearly separated from proof-backed commercial truth
- Missing: explicit released-funds / realized-profit ladder framing
- Classification: `partially_canonical`

### `Reports.tsx`

- Purpose: analytics and reporting
- Backend truth consumed: reporting/analytics endpoints
- Truth gaps: predictive and performance views can be mistaken for operational proof
- Missing: stronger analytics-only framing and separation from live operations truth
- Classification: `partially_canonical`

### `AdminPanel.tsx`

- Purpose: admin actions and technical overview
- Backend truth consumed: admin APIs
- Truth gaps: not aligned to canonical operations truth as an operator surface
- Classification: `partially_canonical`

### `Diagnostics.tsx`

- Purpose: technical diagnostics
- Backend truth consumed: health/connectivity/auth endpoints
- Strengths: technical page, not pretending to be business truth
- Truth gaps: does not connect diagnosis to canonical operator next actions
- Classification: `partially_canonical`

## Legacy / Misleading / Duplicated / Merge-Candidate

### `WorkflowSummaryWidget.tsx`

- Derived workflow narrative from product and inventory summaries
- Uses legacy lifecycle stages that do not match the real dropshipping lifecycle
- Strong duplication risk
- Classification: `duplicated`, `merge_candidate`, `removable`

### `ProductWorkflowPipeline.tsx`

- Shows legacy generalized stages like analyze/publish/purchase
- Does not represent image remediation, external review, proof ladder, or realized-profit boundaries
- Classification: `stale`, `merge_candidate`

### `AutopilotLiveWidget.tsx`

- Useful runtime signal, but too narrow to stand as truth by itself
- Should become a subpanel inside a canonical automation page
- Classification: `partially_canonical`, `merge_candidate`

### `InventorySummaryCard.tsx`

- Useful summary helper, but insufficiently explicit about blocker truth and proof truth
- Classification: `partially_canonical`, `merge_candidate`

### `BalanceSummaryWidget.tsx`

- Good technical-financial helper, but can over-read as commercial readiness
- Classification: `partially_canonical`, `merge_candidate`

## Low-Risk Technical / Informational Surfaces

- `Login.tsx`
- `RequestAccess.tsx`
- `ManualLogin.tsx`
- `ResolveCaptcha.tsx`
- `HelpCenter.tsx`
- docs/API/investor viewers and lists
- `Settings.tsx`
- `WorkflowConfig.tsx`
- `APIConfiguration.tsx`
- `APISettings.tsx`
- `APIKeys.tsx`
- `OtherCredentials.tsx`
- `Users.tsx`
- `SystemLogs.tsx`
- `NotFound.tsx`

These pages are not major parity risks unless they start presenting operational status as business truth.

## Audit Conclusion

The frontend now has a real canonical spine, but not every page has converged. The biggest remaining truth risk is not fake metrics on the main pages anymore; it is the coexistence of:

- canonical operator truth
- legacy workflow storytelling
- estimate-heavy finance/publishing language
- partial order/fulfillment truth without the full commercial proof ladder
