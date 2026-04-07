# P55 — Legacy Widget Retirement

## WorkflowSummaryWidget

- **Finding:** No production imports referenced the widget (only mentioned in internal docs).
- **Action:** Replaced implementation with a **no-op** component returning `null`, JSDoc `@deprecated`, instructing operators to use Control Center + operations-truth APIs instead.
- **Rationale:** Prevents reintroduction of coarse `PENDING`/`isPublished` stage counts as lifecycle truth.

## ProductWorkflowPipeline

- **Finding:** Component was already rebuilt around **`fetchOperationsTruth`** (listing, blocker, proof ladder, agent trace) — not the old static pipeline.
- **Action:** Wired **`useEnvironment()`** so truth requests pass `environment` (sandbox/production parity with other surfaces).

## Files

- `frontend/src/components/WorkflowSummaryWidget.tsx`
- `frontend/src/components/ProductWorkflowPipeline.tsx`
