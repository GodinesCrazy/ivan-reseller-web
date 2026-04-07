## P51 - Prioritized UI/UX Improvement Plan

### P0 - Dangerous misleading truth issues

1. Remove hardcoded conversion rate from `Sales.tsx`
- Why it matters: simulated KPI shown as real business signal
- Impact: operator may believe sales engine is healthier than reality
- Backend dependency: none
- Frontend dependency: low
- Blocks autonomous readiness: yes

2. Remove local-only automation truth from `Dashboard.tsx`
- Why it matters: config illusion becomes operational illusion
- Impact: false confidence in autonomy state
- Backend dependency: use real autopilot/runtime source only
- Frontend dependency: low
- Blocks autonomous readiness: yes

3. Stop showing generic `profit` labels where values are only estimates
- Why it matters: implies commercial success before proof exists
- Impact: financial misunderstanding
- Backend dependency: moderate renaming/contract cleanup
- Frontend dependency: moderate
- Blocks autonomous readiness: yes

### P1 - Critical parity fixes

1. Introduce canonical listing truth surface
- Show local state, external state, sub-status, blocker, next action
- Impact: resolves real ML under-review contradictions
- Backend dependency: moderate
- Frontend dependency: moderate
- Blocks autonomous readiness: yes

2. Replace frontend-derived workflow summary with canonical lifecycle contract
- Impact: removes narrative drift
- Backend dependency: moderate
- Frontend dependency: moderate
- Blocks autonomous readiness: yes

3. Add post-sale proof ladder to Orders/Sales
- Impact: clarifies order vs supplier purchase vs payout vs realized profit
- Backend dependency: moderate
- Frontend dependency: moderate
- Blocks autonomous readiness: yes

### P2 - High-value operational UX upgrades

1. Add Agent Decision Trace panel
- Impact: traceability and trust
- Backend dependency: moderate
- Frontend dependency: moderate
- Blocks autonomous readiness: partially

2. Rebuild Dashboard as Operations Dashboard
- Impact: single operational truth surface
- Backend dependency: high if canonical overview endpoint is added
- Frontend dependency: high
- Blocks autonomous readiness: partially

3. Split technical readiness from commercial readiness
- Impact: removes ambiguity for real operations
- Backend dependency: low to moderate
- Frontend dependency: moderate
- Blocks autonomous readiness: partially

### P3 - Optimization and clarity improvements

1. Normalize marketplace-neutral language in Orders and Sales
- Impact: better operator clarity
- Backend dependency: none
- Frontend dependency: low
- Blocks autonomous readiness: no

2. Consolidate duplicate health widgets
- Impact: less contradiction and clutter
- Backend dependency: low
- Frontend dependency: moderate
- Blocks autonomous readiness: no

3. Improve evidence timestamps and source labels
- Impact: better operator trust
- Backend dependency: moderate
- Frontend dependency: low
- Blocks autonomous readiness: no

### Recommended implementation order

1. P0 truth removals and relabels
2. canonical listing truth
3. post-sale proof ladder
4. canonical lifecycle model
5. agent decision trace
6. dashboard/control-center unification
