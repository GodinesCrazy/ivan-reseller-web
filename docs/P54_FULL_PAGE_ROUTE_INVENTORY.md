# P54 Full Page / Route Inventory

Date: 2026-03-24
Owner: Codex

## Scope

P54 audited the full routed frontend plus the helper surfaces that materially present operational truth.

Exact inventory audited:

- `46` page files under `frontend/src/pages`
- `49` route declarations in `frontend/src/App.tsx`
- `12` key truth-bearing helper widgets/components
- `58` material surfaces total for the truth audit

## Route Inventory

### Primary operational surfaces

- `/dashboard` -> `Dashboard.tsx`
- `/control-center` -> `ControlCenter.tsx`
- `/products` -> `Products.tsx`
- `/products/:id/preview` -> `ProductPreview.tsx`
- `/sales` -> `Sales.tsx`
- `/orders` -> `Orders.tsx`
- `/orders/:id` -> `OrderDetail.tsx`
- `/pending-purchases` -> `PendingPurchases.tsx`
- `/publisher` -> `IntelligentPublisher.tsx`
- `/autopilot` -> `Autopilot.tsx`

### Secondary operational surfaces

- `/opportunities` -> `Opportunities.tsx`
- `/opportunities/:id` -> `OpportunityDetail.tsx`
- `/opportunities/history` -> `OpportunitiesHistory.tsx`
- `/product-research` -> `ProductResearch.tsx`
- `/checkout` -> `Checkout.tsx`
- `/commissions` -> `Commissions.tsx`
- `/finance` -> `FinanceDashboard.tsx`
- `/flexible` -> `FlexibleDropshipping.tsx`
- `/jobs` -> `Jobs.tsx`
- `/reports` -> `Reports.tsx`
- `/regional` -> `RegionalConfig.tsx`
- `/admin` -> `AdminPanel.tsx`

### Technical / setup surfaces

- `/system-status` -> `SystemStatus.tsx`
- `/settings` -> `Settings.tsx`
- `/workflow-config` -> `WorkflowConfig.tsx`
- `/api-config` -> `APIConfiguration.tsx`
- `/api-settings` -> `APISettings.tsx`
- `/api-keys` -> `APIKeys.tsx`
- `/other-credentials` -> `OtherCredentials.tsx`
- `/users` -> `Users.tsx`
- `/logs` -> `SystemLogs.tsx`
- `/diagnostics` -> `Diagnostics.tsx`
- `/setup-required` -> `SetupRequired.tsx`
- `/meeting-room` -> `MeetingRoom.tsx`
- `/onboarding` -> `Onboarding` route target in `App.tsx`

### Access / auth / support surfaces

- `/login` -> `Login.tsx`
- `/request-access` -> `RequestAccess.tsx`
- `/manual-login/:token` -> `ManualLogin.tsx`
- `/resolve-captcha/:token` -> `ResolveCaptcha.tsx`
- `/help` -> `HelpCenter.tsx`
- `/help/apis` -> `APIDocsList.tsx`
- `/help/apis/:slug` -> `APIDocViewer.tsx`
- `/help/docs` -> `DocsList.tsx`
- `/help/docs/:slug` -> `DocViewer.tsx`
- `/help/investors` -> `InvestorDocsList.tsx`
- `/help/investors/:slug` -> `InvestorDocViewer.tsx`
- `*` -> `NotFound.tsx`

## Helper Surface Inventory

Truth-bearing helpers audited:

- `OperationsTruthSummaryPanel.tsx`
- `PostSaleProofLadderPanel.tsx`
- `AgentDecisionTracePanel.tsx`
- `SalesReadinessPanel.tsx`
- `InventorySummaryCard.tsx`
- `AutopilotLiveWidget.tsx`
- `BalanceSummaryWidget.tsx`
- `WorkflowSummaryWidget.tsx`
- `ProductWorkflowPipeline.tsx`
- `CycleStepsBreadcrumb.tsx`
- `OrderStatusBadge.tsx`
- `ProtectedRoute.tsx`

## Operational Relevance Classification

### Canonical or near-canonical primary truth surfaces

- `ControlCenter.tsx`
- `SystemStatus.tsx`
- `OperationsTruthSummaryPanel.tsx`
- `PostSaleProofLadderPanel.tsx`
- `AgentDecisionTracePanel.tsx`
- `SalesReadinessPanel.tsx`

### Partially canonical operational surfaces

- `Dashboard.tsx`
- `Products.tsx`
- `Sales.tsx`
- `Orders.tsx`
- `OrderDetail.tsx`
- `PendingPurchases.tsx`
- `IntelligentPublisher.tsx`
- `Autopilot.tsx`
- `ProductPreview.tsx`
- `FinanceDashboard.tsx`
- `Reports.tsx`
- `InventorySummaryCard.tsx`
- `AutopilotLiveWidget.tsx`
- `BalanceSummaryWidget.tsx`

### Legacy / stale / duplicate / merge-candidate surfaces

- `WorkflowSummaryWidget.tsx`
- `ProductWorkflowPipeline.tsx`
- analytics-heavy summary blocks inside `Dashboard.tsx`
- legacy workflow narratives inside `Autopilot.tsx`
- listing summary rows inside `IntelligentPublisher.tsx`
- estimated-gain panels inside `PendingPurchases.tsx`

### Low-risk technical or informational surfaces

- auth pages
- doc/help viewers
- setup/API credential/config pages
- `Diagnostics.tsx`
- `NotFound.tsx`

## Inventory Summary

High-level classification of the `58` audited material surfaces:

- `6` canonical
- `24` partially canonical
- `15` legacy, stale, duplicated, or merge-candidate
- `13` low-risk technical or informational surfaces

This leaves the frontend materially improved versus P51, but still not fully converged onto one dominant operational truth model.
