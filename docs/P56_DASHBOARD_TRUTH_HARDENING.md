# P56 — Dashboard Truth Hardening

## Goal

Ensure canonical listing truth, blockers, and proof ladder dominate; demote analytics widgets to clearly-labeled secondary role.

## Changes

- **Summary line:** Reordered to show **proof-backed** first (realizedProfitObtained count when > 0), then **analytics** (margen neto agregado, ventas, publicados). Added disclaimer that financial totals are ledger aggregates; canonical truth is in Control Center.
- **Metrics grid:** Added preamble "Métricas de panel — agregados del sales ledger; no sustituyen proof canónico."
- **Profit card:** Relabeled "Margen neto registrado" → "Margen neto (agregado)"; removed dominant emerald border; demoted to same visual weight as other cards.
- Operations truth panels (OperationsTruthSummaryPanel, PostSaleProofLadderPanel, AgentDecisionTracePanel) were already present from P53/P54; they remain dominant above the metrics grid.

## Files

- `frontend/src/pages/Dashboard.tsx`
