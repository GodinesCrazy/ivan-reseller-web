# Final Transformation Plan

Date: 2026-03-21

## P0 - Blockers To First `VALIDATED_READY`

### P0.1 Enforce destination-first candidate quality

- Exact issue: strict-ready yield is zero
- Why it matters to real profit: no first listing exists without this
- Subsystem affected: discovery, supplier validation, product enrichment
- Recommended solution: ingest only candidates that can resolve destination, shipping, cost, and SKU truth quickly
- Basis: both current architecture and competitor adaptation
- Validation proof required: first non-demo `VALIDATED_READY` product

### P0.2 Remove false publish readiness from legacy surfaces

- Exact issue: stale `publishable` logic created misleading readiness
- Why it matters to real profit: it wastes cycles and hides the real blocker
- Subsystem affected: marketplace publish flow
- Recommended solution: keep the new strict publisher behavior and propagate that rule elsewhere
- Basis: current architecture
- Validation proof required: no publish surface can enqueue non-validated-ready products

## P1 - Blockers To First Safe Publish / Order

### P1.1 Recover eBay production auth

- Exact issue: token refresh is failing
- Why it matters to real profit: lead marketplace cannot operate safely
- Subsystem affected: eBay OAuth and publish
- Recommended solution: credential integrity repair and live auth verification
- Basis: current architecture
- Validation proof required: successful production refresh and authenticated API call

### P1.2 Recover live webhook readiness

- Exact issue: stored proof is stronger than current live readiness
- Why it matters to real profit: real order proof needs live event flow
- Subsystem affected: eBay webhook layer
- Recommended solution: re-register endpoint, tokens, topics, and destination registry
- Basis: current architecture
- Validation proof required: passing readiness diagnostic plus first inbound valid event

## P2 - Blockers To First Automatic Supplier Purchase / Payment

### P2.1 Persist supplier variant mapping per sell-side candidate

- Exact issue: SKU persistence is too weak
- Why it matters to real profit: auto-purchase fails or becomes stale
- Subsystem affected: validation and fulfillment
- Recommended solution: persist validated supplier variant and shipping choice before publish
- Basis: competitor adaptation plus current architecture
- Validation proof required: published product has stable supplier variant mapping used at order time

### P2.2 Model supplier payment as its own truth state

- Exact issue: supplier order placement and supplier payment completion are not separated enough
- Why it matters to real profit: unpaid supplier orders are not fulfilled business wins
- Subsystem affected: fulfillment, purchase logs, post-sale reporting
- Recommended solution: add distinct operational reporting and then code-state persistence for payment-pending versus payment-complete
- Basis: competitor adaptation plus current architecture
- Validation proof required: first valid order shows explicit supplier payment state through completion

## P3 - Blockers To First Realized Net-Profit Proof

### P3.1 Link released-funds truth to realized-profit recognition

- Exact issue: valid payout release is not proven
- Why it matters to real profit: delivered is not the same as paid out
- Subsystem affected: sales ledger, payout workflow, real-profit reporting
- Recommended solution: gate finalized-profit rows on payout release evidence
- Basis: current architecture
- Validation proof required: one production sale counted as finalized after actual payout release

### P3.2 Improve proof-exclusion reporting

- Exact issue: the system correctly excludes weak rows, but operators need sharper visibility into why
- Why it matters to real profit: it speeds first-profit debugging
- Subsystem affected: diagnostics, reporting
- Recommended solution: expose exclusion reasons in readiness and profit diagnostics
- Basis: current architecture
- Validation proof required: operators can identify blocked rows without ad hoc DB inspection

## P4 - Blockers To Repeatable Autonomous Operation

### P4.1 Add measurable failure learning to discovery

- Exact issue: failure reasons exist but do not yet drive measurable discovery improvement
- Why it matters to real profit: repeatability depends on learning
- Subsystem affected: optimizer, discovery, ranking
- Recommended solution: downrank repeated failure clusters by destination, shipping profile, and supplier reliability
- Basis: both
- Validation proof required: subsequent cycles show improved strict-ready yield

### P4.2 Add issue-queue style operational reporting

- Exact issue: automation exists, but issue states are still too buried
- Why it matters to real profit: repeatability needs fast operator intervention where automation legitimately stops
- Subsystem affected: dashboards, scripts, notifications
- Recommended solution: expose queues for unmapped orders, payment-pending purchases, stale SKUs, payout-blocked sales
- Basis: competitor adaptation plus current architecture
- Validation proof required: one operator can resolve blocked cases without manual DB digging
