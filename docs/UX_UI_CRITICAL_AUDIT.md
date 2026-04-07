# UX/UI Critical Audit

Date: 2026-03-20

## UX verdict

- Overall: `PARTIAL`
- Operator trust: `WEAK`
- Control-cockpit quality: `AMBITION HIGH, EXECUTION PARTIAL`

## What the product is trying to be

Ivan Reseller is trying to act as an autonomous commerce control cockpit, not just a product list.  
That ambition is correct.  
The problem is that the current UI is still ahead of the verified operational truth in several areas.

## Major pages and flows

### Dashboard

Strengths:
- Broad view of business, inventory, automation, and activity.
- Potentially useful as an operator home.

Critical issues:
- Dashboard code still supports `SAFE_DASHBOARD_MODE`, which is dangerous if it ever feeds production because it can normalize empty or safe-looking fallback states.
- Too many abstractions are shown without enough evidence of underlying health.
- International context is not clearly foregrounded:
  - marketplace
  - country
  - language
  - currency
  - fee completeness

### Products

Strengths:
- Central product management surface exists.

Critical issues:
- Frontend status model still lags backend truth model.
- The page does not strongly expose:
  - `LEGACY_UNVERIFIED`
  - `VALIDATED_READY`
  - blocked reasons
  - supplier validation evidence
  - country qualification
  - language qualification
  - currency qualification
- This is a major trust problem. A safe engine only matters if the operator can see why products are blocked or eligible.

### Listings

Critical issues:
- No strong evidence of a current first-class listing truth screen that clearly distinguishes:
  - active marketplace listings
  - failed publish attempts
  - ghost/legacy-linked listing rows
  - country/site
  - language
  - currency

### Orders

Critical issues:
- The system now knows a lot more about fulfillment risk than typical order tables show.
- The UI must elevate:
  - destination country
  - supplier chosen
  - SKU used
  - purchase status
  - blocked reason
  - manual fallback needed
- Without this, operators cannot act confidently on failures.

### Analytics

Critical issues:
- `/analytics` is not an actual routed page in the current frontend app.
- Any navigation or expectation of a dedicated analytics workspace is misleading.

### Integrations / setup

Strengths:
- Setup-status logic improved on backend.

Critical issues:
- The UI still needs to separate:
  - configured
  - authenticated
  - operational
  - webhook-ready
  - event-flow-ready
- These states should never be collapsed into one green badge.

### Control center

Strengths:
- Good strategic direction.
- It aims to be an operations cockpit.

Critical issues:
- This page class is the highest false-confidence risk in the app.
- When readiness abstractions are broader than the underlying proof, operators can believe the machine is safer than it is.
- The page should not present “system ready” style language unless:
  - live listings are real,
  - connectors are operational,
  - webhooks are configured,
  - profit completeness is high,
  - fulfillment path is proven.

### Finance

Strengths:
- Best candidate for a professional operator cockpit.
- Multiple views and breakdowns exist.

Critical issues:
- The finance surface is more mature visually than the fee model is logically.
- It should explicitly disclose:
  - modeled fees
  - missing fees
  - FX source
  - FX timestamp
  - shipping completeness
  - tax completeness
  - publication-cost completeness
- Without that, sophisticated UI can still mislead.

## Cross-cutting UX failures

### 1. Weak truth labeling

The app still needs standard labels such as:
- `Configured`
- `Authenticated`
- `Operational`
- `Webhook Ready`
- `Event Flow Ready`
- `Financially Safe`
- `Publish Safe`

### 2. Weak international clarity

The operator should always see:
- marketplace
- site/country
- publication language
- listing currency
- supplier ship-to country
- fee basis

Today, too much of that context is implicit or buried.

### 3. Weak automation explainability

A superior automation system must say:
- why it published
- why it blocked
- why it repriced
- why it paused
- why it required manual action

Today, that explainability is stronger in backend direction than in UI execution.

### 4. Weak recovery UX

The system has historical failed order reality, but UI evidence for:
- clear root cause
- exact next action
- safe retry criteria
- supplier rematch possibility
is not strong enough.

### 5. Weak hierarchy for operator decisions

The app likely shows too much surface area before it proves:
- what is actually sellable
- what is risky
- what is blocked
- what needs attention now

## Required UX redesign direction

### Immediate

- Replace generic health/readiness summaries with evidence-based operational cards.
- Make marketplace cards show:
  - configured
  - authenticated
  - operational
  - webhook-ready
  - event-flow-ready
- Make products show safe-publish evidence directly.
- Add first-class blocked reasons and validation evidence chips.

### Before controlled sale

- Add a dedicated `Validated Catalog` view.
- Add a dedicated `Failures & Manual Action` view.
- Add a `Publication Context` panel on every product/listing:
  - country
  - language
  - currency
  - marketplace fees
  - shipping basis

### Before scaling

- Add an operator-grade automation audit trail:
  - decision
  - evidence
  - timestamp
  - marketplace
  - country
  - supplier
  - cost basis

## Final UX assessment

The UI is not weak because it lacks pages.  
It is weak because the current pages still outrun the truth model that an operator must rely on to trust automation.

That means Ivan Reseller does not yet beat top tools in cockpit clarity, even if its long-term architecture could.
