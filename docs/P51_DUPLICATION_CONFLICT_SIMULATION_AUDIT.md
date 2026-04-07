## P51 - Duplication / Conflict / Simulation Audit

### Confirmed simulation problems

1. Hardcoded conversion metric
   - `frontend/src/pages/Sales.tsx`
   - `Conversion Rate = 78%`
   - This is simulated and must be removed or replaced with a real backend metric.

2. Local automation mode truth
   - `frontend/src/pages/Dashboard.tsx`
   - `isAutomaticMode` is local frontend state.
   - This is not canonical system truth.

### Confirmed duplication/conflict problems

1. System health duplicated in multiple reductive surfaces
   - `Dashboard.tsx`
   - `SystemStatus.tsx`
   - `ControlCenter.tsx`
   Each expresses system condition differently and at different levels of depth.

2. Workflow duplicated with different models
   - `WorkflowSummaryWidget.tsx`
   - `ProductWorkflowPipeline.tsx`
   - `Autopilot.tsx`
   - `ControlCenter.tsx`
   These do not share one canonical lifecycle contract.

3. Product published truth vs listing live truth
   - `Products.tsx` can communicate `PUBLISHED`
   - Recent live truth showed ML listing `under_review / waiting_for_patch`
   - This contradiction is not surfaced consistently.

4. Profit truth duplicated across screens with inconsistent semantics
   - `Dashboard.tsx` shows revenue/profit summaries
   - `Products.tsx` shows unit profit estimate
   - `ProductPreview.tsx` shows potential/gross/net style financial estimates
   - `Sales.tsx` shows profit totals
   These are not clearly separated into:
   - estimate
   - sale-level accounting
   - released-funds proof
   - realized profit

5. Publication operations duplicated
   - `ProductPreview.tsx`
   - `IntelligentPublisher.tsx`
   - `Products.tsx`
   Different surfaces can initiate publish-related flows without one canonical "publish safety and live listing state" panel.

### Stale or over-optimistic surfaces

1. Dashboard "Motor IA disponible"
   - Too optimistic because backend health is not equal to agent effectiveness.

2. System readiness cards
   - Too technical on some screens, too optimistic on others.

3. Profit distribution and utilities cards
   - Risky unless explicitly bound to completed financial proof.

4. "Sales optimization" and "sales acceleration" language
   - Useful operationally, but can read like business success even when no buyer order exists.

### Remove, merge, or relabel

Remove:

- hardcoded conversion percentage
- any local-only automation toggle presented as system truth

Merge:

- dashboard system health + system status + control center readiness into one canonical operations health model
- workflow summaries into one canonical lifecycle source

Relabel:

- `Profit` on product/catalog surfaces -> `Estimated unit margin`
- `Utilidades` on non-payout-proof surfaces -> `Recorded margin` or `Accounting estimate`
- `Published` -> `Listing created` only when not confirmed live-active

### Judgment

The duplication problem is structural, not cosmetic. Different screens currently tell different stories about the same business state. This is a high-risk operational UX issue.
