# P56 — Reports Truth Refactor

## Goal

Refactor Reports so reports are clearly analytics/reporting, not operational proof.

## Changes

- **Banner:** Added prominent amber banner at top: "Analytics only — not operational proof." Explains that reports are aggregated/analytical data; for canonical operational truth (blockers, proof ladder, listing state), users should use Control Center, Orders, and Finance.
- **Link:** Control Center linked inline in banner.
- Report types (sales, products, users, marketplaces, listing-performance, winning-products, etc.) unchanged; the banner frames the entire page as analytics-only.

## Files

- `frontend/src/pages/Reports.tsx`
