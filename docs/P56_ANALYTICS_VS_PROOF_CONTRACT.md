# P56 — Analytics vs Proof Contract

Date: 2026-03-24  
Owner: P56 Sprint

## Purpose

Formal UI labeling and contract rules so operators never mistake analytics, estimates, or heuristics for operational proof. This is a reusable product rule for all frontend surfaces.

---

## Canonical Labels

Use these terms consistently:

| Term | Meaning | Use when |
|------|---------|----------|
| **estimated** / **(estim.)** | Value derived from calculations or assumptions, not backend-recorded proof | Unit economics, pre-publication margin, ROI before sale |
| **projected** | Forward-looking value based on historical or default models | Profit projection, sales forecast |
| **heuristic** | Score or signal from internal rules; not externally verified | WinningScore, health score, priority score |
| **referential** | For context only; does not claim operational truth | Cost breakdown as reference, capital snapshot |
| **aggregate** / **(agregado)** | Sum or count from data store; may mix proof-backed and non-proof-backed rows | Sales ledger total, dashboard stats |
| **proof-backed** | Value supported by canonical proof ladder (supplier purchase, tracking, delivered, released funds, realized profit) | Order with aliexpressOrderId, sale with payoutExecuted |
| **externally confirmed** | Verified by external system (marketplace API, PayPal, etc.) | Live listing state from ML API |
| **released-funds confirmed** | Payout executed; funds no longer held by marketplace | `payoutExecuted` true in sales ledger |
| **realized-profit confirmed** | Proof ladder shows `realizedProfitObtained` | Canonical operations truth item with proof |

---

## Rules

1. **Never present estimated/projected/heuristic values as if they were proof.** Use explicit "(estim.)", "proyectado", "heurístico" in labels.
2. **Finance totals** (revenue, profit, margin) from aggregated data must be labeled as "agregado" or "del ledger" unless the source is explicitly proof ladder.
3. **Profit/margin** in pre-sale contexts (ProductPreview, IntelligentPublisher pending) must always say "estimada", "potencial", or "proyectada".
4. **Winning/health scores** are heuristics; label as "score heurístico" or "heurístico".
5. **Primary operator surfaces** (Control Center, System Status, Order detail, proof ladder panels) show proof-backed or blocker truth first.
6. **Analytics surfaces** (Dashboard metrics, Reports, Finance projection) must include a short disclaimer that they are reference/analytics, not proof.

---

## Reference Implementation

- `ProductPreview.tsx`: Financial modal uses "Rentabilidad estimada (pre-publicación)", "Ganancia neta proyectada (estimada)".
- `FinanceDashboard.tsx`: "Net Profit (agregado ledger)", "Proyección mensual (estimación)", "WinningScore heurístico".
- `Dashboard.tsx`: "Margen neto (agregado)", "Métricas de panel — agregados del sales ledger".
- `Reports.tsx`: Banner "Analytics only — not operational proof".
- `Autopilot.tsx`: "Margen proyectado … (estim.)", "Productos 'winning' (score heurístico)".
- Helper widgets: InventorySummaryCard, BalanceSummaryWidget, AutopilotLiveWidget include subordinate disclaimers.
