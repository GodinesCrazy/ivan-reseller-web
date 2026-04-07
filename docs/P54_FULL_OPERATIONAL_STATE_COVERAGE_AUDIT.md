# P54 Full Operational State Coverage Audit

Date: 2026-03-24
Owner: Codex

## Required Lifecycle Coverage

The product lifecycle that must be traceable in UI is:

1. discovery
2. candidate validation
3. image remediation
4. publication attempt
5. external marketplace review
6. live listing active
7. order ingestion
8. supplier purchase
9. tracking
10. delivery
11. released funds
12. realized profit

## Current Coverage Map

### Discovery

- Visible in: `Opportunities.tsx`, `OpportunitiesHistory.tsx`, `ProductResearch.tsx`, `Autopilot.tsx`
- Quality: partial
- Risk: discovery is visible, but not always connected to later canonical listing/proof truth

### Candidate validation

- Visible in: `Products.tsx`, `ProductPreview.tsx`, `ControlCenter.tsx`
- Quality: partial
- Risk: validation state still competes with legacy workflow labels

### Image remediation

- Visible in: `Products.tsx` and canonical operations truth when blockers are surfaced
- Quality: weak but present
- Risk: dedicated UI for image remediation decisions is still thin outside truth summaries

### Publication attempt

- Visible in: `IntelligentPublisher.tsx`, `ProductPreview.tsx`, `Products.tsx`, `ControlCenter.tsx`
- Quality: partial
- Risk: publication queue is visible, but live external state is not consistently foregrounded on all publication pages

### External marketplace review

- Visible in: canonical operations truth surfaces and product truth panels
- Quality: partial
- Risk: still missing from some publishing and analytics surfaces

### Live listing active

- Visible in: `ControlCenter.tsx`, `SystemStatus.tsx`, `Dashboard.tsx`, `Products.tsx`
- Quality: good on canonical pages, partial elsewhere

### Order ingestion

- Visible in: `Orders.tsx`, `Sales.tsx`, proof ladder panels
- Quality: good

### Supplier purchase

- Visible in: `Orders.tsx`, `OrderDetail.tsx`, `PendingPurchases.tsx`
- Quality: good operationally, but partially disconnected from canonical proof ladder

### Tracking

- Visible in: `OrderDetail.tsx`, `PendingPurchases.tsx`, `Orders.tsx`
- Quality: partial-good

### Delivery

- Visible in: proof ladder summaries and some order views
- Quality: partial
- Risk: not a first-class page/state across the app

### Released funds

- Visible in: canonical proof ladder surfaces
- Quality: present but still not propagated through all finance/sales surfaces

### Realized profit

- Visible in: canonical proof ladder surfaces as a proof state
- Quality: present in canonical panels, but still undermined elsewhere by estimate-heavy profit language

## Missing or Inconsistently Shown Stages

Most inconsistent stages:

- image remediation
- external marketplace review
- released funds
- realized profit

These are precisely the stages most vulnerable to optimistic mislabeling if the UI falls back to product status, publication counts, or projected profit.

## Key Coverage Conflicts

- `ProductWorkflowPipeline.tsx` still tells a lifecycle that does not match the canonical dropshipping stages.
- `Autopilot.tsx` foregrounds runtime workflow metrics more than business-state truth.
- `IntelligentPublisher.tsx` shows publishing operations without enough live marketplace truth.
- `FinanceDashboard.tsx` and `Reports.tsx` can visually dominate commercial interpretation while proof-backed stages remain elsewhere.

## Audit Conclusion

The app now covers the full lifecycle somewhere, but not yet in one consistently authoritative model. Coverage exists; convergence is incomplete.
