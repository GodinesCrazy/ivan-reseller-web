## P53 - ControlCenter Truth Refactor

### Scope

- updated `frontend/src/pages/ControlCenter.tsx`

### What changed

1. ControlCenter now treats canonical operations truth as the dominant source.
2. Listing truth, blocker truth, proof truth, and agent trace now render from `GET /api/dashboard/operations-truth`.
3. Technical readiness remains visible, but explicitly as a sub-layer.
4. Automation controls remain real, but are now clearly framed as technical triggers rather than business success proof.

### Exact canonical truth now visible

- live listing-state counts
- current blockers with next actions
- post-sale proof ladder
- agent decision trace
- evidence timestamp from `generatedAt`
- local listing state vs external marketplace state in the action list

### High-risk legacy truth removed or demoted

- `Platform Funnel`
- `Profit distribution (last 30 days)`
- `Sales optimization (MercadoLibre)`
- pipeline reminder as primary workflow truth
- readiness/utilities language as dominant operational narrative

### Result

ControlCenter is now much closer to a single operational console instead of a blended strategy/analytics narrative.
