# P83 — Decision engine calibration

## What changed

`runRemediationSimulationRanking` now:

1. Emits **low**-fidelity rows for the full shortlist.
2. Optionally emits **high**-fidelity rows for the top **N** candidates by best per-URL `simScore` after low tier.
3. For each candidate URL, **`bestByUrl`** tracks the **maximum** `simScore` across **all** rows (low + high, all recipes).
4. **Remediation attempt order** = shortlist sorted by that max score, then tail candidates unchanged.

## Determinism

- Tie-break: original shortlist index when scores equal.
- Same env → same ordering for the same inputs.

## Final remediation

Unchanged: full `applyRecipe` + production `evaluateDualGatesOnOutputBuffer` + hero + integrity.

## Trace

- `remediationSimulation` contains **both** tiers; rows include `fidelityTier`, `simScoreBase`, `simScore`, `simulationQuality`, `calibratedReasons`.
- `remediationSimulationWinner` uses **calibrated** `simScore`.
- `remediationSimulationHiFiInvoked` / `remediationSimulationHiFiRowCount` summarize the hi-fi pass.
