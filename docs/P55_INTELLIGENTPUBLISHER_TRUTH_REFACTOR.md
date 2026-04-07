# P55 — IntelligentPublisher Truth Refactor

## Goal

Keep canonical listing / blocker / next-action truth ahead of commercial estimates on pending approval cards.

## Changes

- **Pending cards:** operations-truth block moved **above** cost/margin; blocker line now includes `blockerMessage` when present.
- **Estimates demoted:** cost, suggested price, margin, ROI, and per-marketplace profit sit in a dashed “solo estimación pre-publicación” panel with neutral colors (no dominant green “profit” signal).
- **Copy:** explicit reminder that estimates are not realized profit or live listing proof.
- Page-level canonical panels (from P53/P54 work) were already present; this sprint focused on **card-level dominance** of truth vs estimates.

## Files

- `frontend/src/pages/IntelligentPublisher.tsx`
