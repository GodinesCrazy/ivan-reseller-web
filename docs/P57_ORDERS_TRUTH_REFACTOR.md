# P57 — Orders Truth Refactor

Date: 2026-03-24  
Sprint: P57 — Secondary truth surfaces convergence

## Objective

Refactor `Orders.tsx` so it foregrounds real order/fulfillment/proof truth and does not blur analytics, admin signals, or proof-backed truth.

## Completed Changes

### 1. Header and Intro Copy

- **Before:** Generic description of orders and fulfillment; no explicit link to canonical truth.
- **After:** Intro states "Estado real desde backend — sin éxito simulado." and directs operators to Control Center and order detail for proof ladder (compra en proveedor, fondos liberados).
- **Added:** Link to `/control-center` for proof ladder context.

### 2. Truth Rules Applied

- No simulated success as real success (already enforced by `isRealOrder()` filter and OrderDetail P55 hardening).
- Operational truth first: Orders list shows real backend state; Control Center link foregrounds proof ladder.
- Proof ladder context: Explicitly referenced in header copy; per-order proof is in OrderDetail (P55).

### 3. What Was Not Changed

- Order list filtering (`isRealOrder`) — unchanged.
- OrderStatusBadge, manual queue, pagination — unchanged.
- OrderDetail modal/page — already P55-hardened; no changes needed in Orders.tsx.

## Ambiguities Removed

| Before | After |
|--------|-------|
| Orders page could be read as standalone truth without proof context | Header links to Control Center and states proof ladder lives there and in order detail |
| No explicit "sin éxito simulado" | Intro explicitly states real backend state, no simulated success |

## Verification

- Orders foregrounds order/fulfillment state from backend.
- Proof ladder and next-action context are explicitly referenced and linked.
- No success signal appears without proof-backed support (OrderDetail handles per-order).
