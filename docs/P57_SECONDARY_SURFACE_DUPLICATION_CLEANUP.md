# P57 — Secondary Surface Duplication Cleanup

Date: 2026-03-24  
Sprint: P57 — Secondary truth surfaces convergence

## Objective

Reduce duplication and conflict across Orders, Sales, AdminPanel and their helper surfaces. Ensure one dominant truth surface per concern.

## Analysis

### Orders.tsx

- **Dominant concern:** Order list and fulfillment status.
- **Truth source:** Backend orders API; OrderDetail for per-order proof.
- **Duplication:** None introduced. Control Center link added (canonical proof) — not a duplicate, a pointer.
- **Helper surfaces:** OrderStatusBadge, manual queue — subordinate to Orders; no conflict.

### Sales.tsx

- **Dominant concern:** Sales list, proof ladder, stats.
- **Truth source:** Sales API, operations-truth API (proof ladder).
- **Duplication addressed:** Proof ladder was duplicated (Overview tab); moved to top-level above stats so it dominates once.
- **Helper surfaces:** PostSaleProofLadderPanel (now primary on page), SalesReadinessPanel — both subordinate and non-conflicting.

### AdminPanel.tsx

- **Dominant concern:** User management, commissions, platform config.
- **Truth source:** Admin ledger/API — not operational proof.
- **Duplication:** Admin stats (Ingresos, Comisiones) could compete with FinanceDashboard. Mitigated by explicit "agregado admin" and "no es proof operativo" labels.
- **Helper surfaces:** Commission config, user tables — admin-only; no overlap with operational truth.

### Cross-Page Consistency

| Concern | Dominant Surface | Subordinate / Reference |
|---------|------------------|-------------------------|
| Order state | Orders, OrderDetail | Control Center (proof ladder summary) |
| Sales recorded | Sales (list) | — |
| Proof ladder | Control Center, Sales (panel), Finance | — |
| Margen/profit agregado | Sales, FinanceDashboard | AdminPanel (admin ledger only) |
| Admin config | AdminPanel | — |

## Redundant Widgets/Labels Identified

- **PostSaleProofLadderPanel:** Was in Sales Overview tab and now at top level. Removed from Overview to avoid duplication.
- **Stats disclaimers:** Each surface (Sales, AdminPanel) now has its own explicit disclaimer; no single global widget needed.

## Removed / Relabeled

- Sales Overview: Removed duplicate PostSaleProofLadderPanel (now only at top).
- AdminPanel stats: Relabeled with "agregado admin" to avoid confusion with Finance.

## Result

- One dominant truth surface per concern.
- No redundant proof ladder on Sales (single instance above stats).
- Admin stats clearly separated from operational proof.
- Control Center linked from Orders, Sales, AdminPanel as canonical reference.
