# P56 — FinanceDashboard Analytics/Proof Separation

## Goal

Refactor FinanceDashboard so finance analytics cannot be read as commercial proof.

## Changes

- **Header:** Updated info text to explicitly separate "analytics vs proof" — Summary/Ledger from sales; realized profit requires proof ladder (payout executed).
- **Overview stats:** Added preamble that totals are inferred from sales ledger; realized proof is confirmed via proof ladder in Control Center.
- **Net Profit card:** Relabeled "Net Profit (agregado ledger)"; demoted from emerald dominant styling; subtitle "Ventas registradas; after taxes & fees".
- **Gross Profit card:** Relabeled "Gross Profit (ledger)".
- **Profit projection block:** Title → "Proyección mensual (estimación)"; added disclaimer "No es proof; es referencia analítica basada en histórico o defaults."
- **Sales Ledger:** Added note that Payout column indicates released-funds proof; realized profit is confirmed via proof ladder.
- **Top Products:** Relabeled "Top Products (WinningScore heurístico)".

## Files

- `frontend/src/pages/FinanceDashboard.tsx`
