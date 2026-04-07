## P51 - Agent Visibility and Traceability Audit

### Real agent-driven phases already present in the product

- discovery and opportunity selection
- candidate validation
- intelligent publisher decisions
- ML image remediation decision and execution
- marketplace optimization advisory
- order sync and fulfillment automation
- readiness diagnostics and blocking logic

### What the frontend should show

For every agent-driven stage, the UI should answer:

- which agent or subsystem acted
- when it acted
- what decision it made
- why it made that decision
- what evidence it used
- whether the result is:
  - advisory
  - final
  - blocked
  - waiting on external platform
  - manual review required

### Current state

Current frontend agent visibility is weak.

- `Dashboard.tsx`
  - Shows generic AI or automation language.
  - Does not show specific decisions, evidence, or blockers.
- `Autopilot.tsx`
  - Shows workflow/config/status more than decision traceability.
  - Better than most screens, but still not a true agent decision panel.
- `ControlCenter.tsx`
  - Uses system-readiness and funnel language.
  - Does not expose causal agent decisions behind business blockers.
- `IntelligentPublisher.tsx`
  - Exposes approval/publish actions, but not enough decision provenance.

### Missing traceability patterns

1. No canonical "last agent decision" surface per product/listing.
2. No unified blocker evidence panel.
3. No clear difference between:
   - agent recommendation
   - agent final execution
   - human override
   - external platform rejection
4. No per-stage evidence timeline for real operational incidents.
5. No strong surfacing of recent critical facts such as:
   - ML listing under review
   - waiting_for_patch
   - image pack approved
   - order sync found zero orders
   - supplier purchase not attempted because no real order exists

### Required target UX

Per product/listing, add an "Agent Decision Trace" panel with:

- stage
- agentName
- decision
- reasonCode
- humanReadableReason
- evidenceSummary
- blockerState
- externalDependency
- nextAction
- decidedAt

And a system-level "Agent Operations" view with:

- active agents
- last run
- last success/failure
- current blocker count
- advisory vs blocking outputs

### Judgment

The frontend currently exposes automation presence, but not operational traceability. For an AI-agent-driven business product, this is a major UX parity gap.
