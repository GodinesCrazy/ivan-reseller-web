# Prioritized Improvement Plan To Real Profit

Date: 2026-03-21
Goal: Reach the first truthful profitable AliExpress-only operation, then make it repeatable

## P0 - Absolute Blockers To The First Profitable Operation

### P0.1 Recover first `VALIDATED_READY` output

- Exact issue: no product reaches validated-ready state
- Why it matters for real profit: without a safe candidate, the business loop never starts
- Affected subsystem: supplier validation, enrichment, pricing, pre-publish gate
- Recommended fix: enforce destination-first enrichment, mandatory AliExpress SKU capture, and persistence of shipping cost, import tax, and total cost before approval
- Expected business impact: restores the possibility of a truthful first listing
- Validation proof required: at least one non-demo product in `VALIDATED_READY`

### P0.2 Restore eBay production credential health

- Exact issue: live eBay production token refresh is failing with HTTP `400`
- Why it matters for real profit: even a valid product cannot be published or synchronized safely if lead-marketplace auth is broken
- Affected subsystem: eBay OAuth, publish path, sync jobs
- Recommended fix: audit production credential integrity, refresh-token validity, and environment wiring; then prove token refresh in runtime
- Expected business impact: reopens the lead marketplace path
- Validation proof required: successful production token refresh and successful authenticated API call in live runtime

### P0.3 Restore live eBay webhook readiness

- Exact issue: stored webhook proof is stronger than current live readiness
- Why it matters for real profit: without real event flow, valid order capture and post-sale truth remain weak
- Affected subsystem: eBay webhook config, endpoint, notification token, destination registry
- Recommended fix: re-establish endpoint/token/config reachability and prove inbound event readiness
- Expected business impact: enables trustworthy production event capture
- Validation proof required: readiness check passes and first inbound production event is recorded from a valid listing

### P0.4 Prove automatic AliExpress purchase on a valid order

- Exact issue: current purchased orders are synthetic or testlike
- Why it matters for real profit: the business model depends on truthful supplier purchase after real demand
- Affected subsystem: paid-order processing, fulfillment, AliExpress auto-purchase
- Recommended fix: run the first real order through the dropshipping API path with full purchase logging and order-to-product linkage
- Expected business impact: validates the core dropshipping engine
- Validation proof required: one valid marketplace order that results in a real AliExpress order ID and auditable purchase log

### P0.5 Prove supplier-side PayPal settlement

- Exact issue: PayPal purchase automation is not proven
- Why it matters for real profit: order placement without payment completion is not fulfillment
- Affected subsystem: AliExpress checkout path, PayPal integration, purchase reconciliation
- Recommended fix: implement and verify automated supplier-side PayPal completion or explicit hard-stop logic if payment cannot complete safely
- Expected business impact: closes the most critical unproven step in the commercial loop
- Validation proof required: one valid order with confirmed supplier-side PayPal payment and persisted actual cost

### P0.6 Prove released-funds and realized-profit recognition

- Exact issue: real-profit engine currently recognizes zero finalized production profit
- Why it matters for real profit: no business is finished without real money actually realized
- Affected subsystem: sales ledger, payout recognition, real-profit engine
- Recommended fix: wire the first valid operation cleanly through payout release and supplier-cost reconciliation
- Expected business impact: converts technical workflow into real business proof
- Validation proof required: one finalized production row with real positive or negative profit recognized by the engine

## P1 - Blockers To Safe Repeatability

### P1.1 Remove legacy readiness illusions

- Exact issue: stale `publishable` assumptions and legacy listing states can make the system look more ready than it is
- Why it matters for real profit: false readiness leads to operator confusion and unsafe retries
- Affected subsystem: marketplace publish surfaces, listing reconciliation, product status model
- Recommended fix: unify all publish surfaces around strict validated-ready semantics
- Expected business impact: clearer operational truth and fewer wasted cycles
- Validation proof required: no publish surface can enqueue a product that fails the strict gate

### P1.2 Teach the optimizer from repeated rejection reasons

- Exact issue: the system records meaningful rejection reasons but does not prove measurable learning from them
- Why it matters for real profit: repeated failed discovery cycles waste time and API budget
- Affected subsystem: optimizer, discovery ranking, candidate recovery
- Recommended fix: persist failure-pattern penalties and destination-specific success weighting
- Expected business impact: better validated-ready yield over time
- Validation proof required: next discovery cycle shows lower rate of repeated high-confidence rejection causes

### P1.3 Improve tracking truth and error recovery

- Exact issue: current tracking sync processed rows but updated none and returned errors
- Why it matters for real profit: repeatable operations need trustworthy post-sale state
- Affected subsystem: fulfillment tracking sync, delivery reconciliation
- Recommended fix: audit carrier mapping, retry handling, and data-shape assumptions for tracking updates
- Expected business impact: stronger post-sale confidence and better payout timing truth
- Validation proof required: successful tracking updates on real shipped orders

### P1.4 Separate primary operator truth from cross-tenant contamination

- Exact issue: synthetic or secondary-tenant data can distort business confidence
- Why it matters for real profit: false positives around purchased or delivered states can hide real blockers
- Affected subsystem: analytics, dashboards, reporting, audit scripts
- Recommended fix: add stricter tenant-aware and commercial-proof-aware filters to operational reports
- Expected business impact: cleaner decision-making
- Validation proof required: primary-user dashboards and audits exclude synthetic cross-tenant noise by default

## P2 - Blockers To High-Quality Automation

### P2.1 Tighten ingestion quality

- Exact issue: catalog scale is large, but commercial-grade attribute completeness is near-zero
- Why it matters for real profit: automation quality depends on better inputs, not just more rows
- Affected subsystem: product ingestion, enrichment, supplier mapping
- Recommended fix: fail fast on missing destination, SKU, and cost essentials
- Expected business impact: smaller but far more usable catalog
- Validation proof required: materially improved attribute completeness ratios in newly ingested products

### P2.2 Build a destination-first daily cycle

- Exact issue: current automation runs, but not as a fully business-aware daily engine
- Why it matters for real profit: discovery needs to search within the constraints that actually decide profitability
- Affected subsystem: schedulers, trends, discovery, validation handoff
- Recommended fix: run scheduled destination-scoped searches with direct handoff into strict validation
- Expected business impact: higher candidate quality and less wasted processing
- Validation proof required: daily cycle produces auditable candidate funnel metrics from discovery to validated-ready

### P2.3 Persist real purchase telemetry

- Exact issue: purchase logs and successful operations evidence are too weak
- Why it matters for real profit: automation cannot be debugged or trusted without durable transaction traces
- Affected subsystem: fulfillment, purchase logging, operations ledger
- Recommended fix: log every supplier purchase attempt, payment outcome, and tracking acquisition in a commercial-proof ledger
- Expected business impact: faster recovery and better auditability
- Validation proof required: one full operation can be replayed from logs without ambiguity

## P3 - Later Scaling Improvements

### P3.1 Expand optimizer sophistication after first profit proof

- Exact issue: optimization effort before first proof can become premature
- Why it matters for real profit: scale features matter after the first profitable loop exists
- Affected subsystem: ranking, trend blending, policy tuning
- Recommended fix: add deeper learning, success weighting, and portfolio-style balancing only after first-profit proof
- Expected business impact: better scaling without distracting from the real bottleneck
- Validation proof required: repeatable profit loop already exists

### P3.2 Improve multi-marketplace orchestration after eBay recovery

- Exact issue: marketplace breadth is currently weaker than marketplace depth
- Why it matters for real profit: scaling across channels only matters once one channel works honestly
- Affected subsystem: marketplace abstraction, auth lifecycle, order normalization
- Recommended fix: treat MercadoLibre and Amazon as second-wave work after eBay first-profit proof
- Expected business impact: cleaner expansion path
- Validation proof required: eBay path already produced real profit and repeatability

## Final Priority Statement

If the team does only three things next, they should be:

1. get one real `VALIDATED_READY` product
2. restore live eBay auth and webhook readiness
3. prove one valid AliExpress purchase with supplier-side PayPal settlement and released-funds profit recognition

Until those three are done, the software remains not finished.
