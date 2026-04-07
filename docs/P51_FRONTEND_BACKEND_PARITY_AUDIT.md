## P51 - Frontend/Backend Parity Audit

### Scope audited

- Frontend routes and screens in `frontend/src/App.tsx`
- Main operational screens:
  - `frontend/src/pages/Dashboard.tsx`
  - `frontend/src/pages/Products.tsx`
  - `frontend/src/pages/ProductPreview.tsx`
  - `frontend/src/pages/Orders.tsx`
  - `frontend/src/pages/Sales.tsx`
  - `frontend/src/pages/Autopilot.tsx`
  - `frontend/src/pages/SystemStatus.tsx`
  - `frontend/src/pages/ControlCenter.tsx`
  - `frontend/src/pages/IntelligentPublisher.tsx`
- Key frontend components:
  - `frontend/src/components/SalesReadinessPanel.tsx`
  - `frontend/src/components/WorkflowSummaryWidget.tsx`
  - `frontend/src/components/ProductWorkflowPipeline.tsx`
- Backend contracts:
  - `backend/src/api/routes/dashboard.routes.ts`
  - `backend/src/api/routes/products.routes.ts`
  - `backend/src/api/routes/orders.routes.ts`
  - `backend/src/api/routes/sales.routes.ts`
  - `backend/src/api/routes/system.routes.ts`
  - `backend/src/api/routes/setup-status.routes.ts`
  - `backend/src/api/routes/webhooks.routes.ts`

### Executive judgment

The frontend is not yet a truthful operational control surface. The backend already contains much richer operational truth than the frontend exposes, but the UI still mixes:

- real backend states
- frontend-derived states
- estimated commercial values
- placeholder or simulated performance indicators
- broad readiness labels that collapse materially different realities

This creates parity drift between what the system is actually capable of doing and what an admin may believe is happening.

### Surfaces currently closest to truth

- `Orders.tsx`
  - Uses real order rows and sync status.
  - Exposes manual intervention and retry actions.
  - Explicitly differentiates some real automation states.
- `SalesReadinessPanel.tsx`
  - Uses `/api/setup-status` and `/api/webhooks/status`.
  - Communicates webhook/manual sync fallback more honestly than most screens.
- `ProductWorkflowPipeline.tsx`
  - Better than summary widgets because it consumes a backend workflow endpoint instead of inventing counts locally.
  - Still incomplete for the real ML lifecycle.

### Major parity failures

1. Local UI state is presented as if it were operational truth.
   - `Dashboard.tsx` uses local `isAutomaticMode` toggle.
   - This is not canonical backend automation truth.

2. Connectivity is presented as capability.
   - `SystemStatus.tsx` and parts of `Dashboard.tsx` reduce truth to connected/not connected.
   - A connected marketplace is not equivalent to publication-ready, order-ingestion-ready, or commercial-proof-ready.

3. Product truth and listing truth are collapsed.
   - Recent real execution already proved the system can have:
     - product local state: `PUBLISHED / isPublished=true`
     - live ML item state: `under_review / waiting_for_patch`
   - Current UI does not consistently surface this contradiction as first-class operational truth.

4. Estimated profit is exposed in ways that can be mistaken for realized profit.
   - `Products.tsx` uses backend `profit`, which is derived unit margin.
   - `Sales.tsx` shows profit totals without separating:
     - estimated margin
     - completed sale profit
     - released-funds proof
     - realized profit proof

5. Frontend synthesizes workflow truth that backend did not canonically declare.
   - `WorkflowSummaryWidget.tsx` maps product and order counts into workflow stages on the client.
   - This is a derived narrative, not a canonical operational contract.

6. Some screens still include simulated or unsupported business signals.
   - `Sales.tsx` contains a hardcoded `Conversion Rate = 78%`.
   - This directly violates the no-simulated-values rule.

7. Agent execution is mostly invisible.
   - The product is AI-agent-driven, but the frontend rarely shows:
     - which agent acted
     - which decision it made
     - why it decided it
     - what evidence or blocker it found
     - whether the result is advisory, blocked, or final

### High-value backend truth not properly surfaced

- `dashboard.routes.ts`
  - `/api/dashboard/inventory-summary`
  - `listingTruth`
  - `listingsSource`
  - `lastSyncAt`
- `products.routes.ts`
  - `/api/products/post-sale-overview`
  - `/api/products/:id/workflow-status`
  - `validationState`
  - `blockedReasons`
  - `feeCompleteness`
  - `marketplaceContextSafety`
- `sales.routes.ts`
  - virtual marketplace sales without Sale rows
  - `fulfillmentAutomationStatus`
  - `fulfillmentErrorReason`
- `setup-status.routes.ts`
  - `connectorReadiness`
  - `automationReadyMarketplaceCount`
  - `missingRequirements`
- `webhooks.routes.ts`
  - real webhook readiness and webhook proof model

### Net result

The backend is ahead of the frontend. The remediation priority is not "add more dashboards"; it is:

- stop presenting inferred truth as canonical truth
- converge the UI onto canonical lifecycle contracts
- expose blockers and proof states directly
- separate readiness from success
- separate publication from commercial success
