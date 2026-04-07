# P55 — Autopilot Truth Refactor

## Goal

Subordinate legacy “cycle storytelling” and dashboard metrics to canonical operations truth.

## Changes

- **Header copy:** Autopilot described as **runtime scheduler** telemetry; deep link to **Control Center** for canonical truth.
- **`fetchOperationsTruth({ limit: 24, environment })`** on load; new panel block with:
  - `OperationsTruthSummaryPanel`
  - `PostSaleProofLadderPanel` + `AgentDecisionTracePanel`
  - Link to Control Center
- **Metrics row:** disclaimer that aggregates are **analytical**, not proof.
- **Relabeled cards:** “Profit Today/Month” → **Margen proyectado … (estim.)**; winning products → **score heurístico**; top list title clarifies non-proof.

## Files

- `frontend/src/pages/Autopilot.tsx`
