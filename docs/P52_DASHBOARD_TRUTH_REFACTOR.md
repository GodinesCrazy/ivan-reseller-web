## P52 - Dashboard Truth Refactor

### Refactor scope

Updated:

- `frontend/src/pages/Dashboard.tsx`

Added:

- `frontend/src/components/OperationsTruthSummaryPanel.tsx`
- `frontend/src/components/PostSaleProofLadderPanel.tsx`
- `frontend/src/components/AgentDecisionTracePanel.tsx`

### What changed

1. Dashboard now consumes canonical operations truth
- Fetches `/api/dashboard/operations-truth`
- surfaces:
  - live listing state counts
  - exact blockers
  - next actions
  - proof ladder counts
  - agent decision trace

2. Dashboard no longer shows local automation truth
- Replaced with real autopilot runtime state from `/api/autopilot/status`

3. Dashboard no longer depends on frontend-derived workflow narrative on the primary surface
- `WorkflowSummaryWidget` removed from dashboard

4. Summary copy made more truthful
- `Ganancia neta` summary changed toward recorded margin language
- proof ladder now makes missing realized-profit proof explicit

### Exact new truthful dashboard surfaces

- Canonical Listing Truth
- Current Blockers
- Post-sale Proof Truth
- Agent Decision Trace

### Truth gain

The dashboard now tells the operator:

- what the listing really looks like live
- what is blocked
- what evidence stage has actually been reached
- what the last agent decided
