## P53 - Remaining Surface Audit

### Surfaces audited

- `frontend/src/pages/ControlCenter.tsx`
- `frontend/src/pages/SystemStatus.tsx`
- overlapping legacy dashboard/system analytics narratives referenced in P52

### Pre-refactor classification

#### ControlCenter

- `partially_canonical`
- `duplicated`
- `misleading`
- `merge_candidate`

Why:

- mixed readiness, funnel, profit-distribution, and autonomous-mode narratives on one surface
- implied operational progress through non-canonical funnel and utilities sections
- duplicated listing/business truth already available from the canonical operations contract

#### SystemStatus

- `partially_canonical`
- `stale`
- `misleading`

Why:

- reduced real operation to connector booleans
- connected services could be misread as listing readiness or commercial readiness
- did not expose live listing state, blockers, proof ladder, or agent decisions

### Post-refactor classification

#### ControlCenter

- `canonical`

Current truth role:

- canonical listing truth
- canonical blocker truth
- canonical post-sale proof truth
- canonical agent decision trace
- technical readiness and automation controls as explicit sub-layers

#### SystemStatus

- `canonical`

Current truth role:

- connector/auth health as infrastructure sub-layer
- canonical operational truth rendered below it
- explicit warning that connectivity is not equivalent to operational readiness

### Remaining overlap after P53

- `Dashboard` still contains some legacy analytics alongside canonical truth
- `Autopilot` remains more technical than operationally canonical
- some helper widgets outside these pages still coexist with the new truth model
