## P52 - Agent Decision Trace Surface

### Implemented first canonical agent trace surface

New component:

- `frontend/src/components/AgentDecisionTracePanel.tsx`

Data source:

- `GET /api/dashboard/operations-truth`
- `agentTrace` and `lastAgentDecision*` fields

### Minimum trace fields now surfaced

- `agentName`
- `stage`
- `decision`
- `reasonCode`
- `evidenceSummary`
- `blocking`
- `advisory`
- `nextAction`
- `decidedAt`

### Where the trace is now visible

- Dashboard agent trace panel
- Products modal per-product truth section

### Truth gain

The UI now shows real agent outputs instead of only generic "AI available" language.
