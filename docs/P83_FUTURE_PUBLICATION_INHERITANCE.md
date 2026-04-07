# P83 — Future publication inheritance

## Default-on

P83 behavior ships inside `runRemediationSimulationRanking` and the canonical pipeline:

- **Calibrated** `simScore` is always used for ranking when simulation is enabled.
- **High-fidelity** top-candidate pass is **on** unless `ML_REMEDIATION_SIM_HIFI=0` / `false`.

## What future publications get

- Per-row `simScoreBase` vs `simScore` for audit (“why did calibration move this?”).
- `simulationQuality` + `calibratedReasons` for operator review.
- Bounded extra cost: hi-fi runs only for **top N** (default 2) after low tier.

## Tuning

Operators can adjust cost/accuracy without code changes via env vars documented in `backend/env.local.example`.
