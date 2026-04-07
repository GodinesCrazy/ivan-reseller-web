# P83 — Trace extension

## Per-row fields (`CanonicalRemediationSimulationDetail`)

| Field | Purpose |
|-------|---------|
| `fidelityTier` | `low` vs `high` preview |
| `simScoreBase` | Pre-calibration rank score (P82-equivalent) |
| `simScore` | **Final** rank score (P83 calibrated) |
| `simulationQuality` | Structured commercial-quality metrics |
| `calibratedReasons` | Short operator-readable list (e.g. `cal_washout_penalty_0.342`) |

## Trace root (`CanonicalPipelineTrace`)

| Field | Purpose |
|-------|---------|
| `remediationSimulationHiFiInvoked` | Whether hi-fi pass ran |
| `remediationSimulationHiFiRowCount` | Number of `high` rows appended |

## Step string

`remediation_simulation:shortlist=…:rows=…:allWeak=…:hifi=…:hifiRows=…`

## Check script

`p77Summary` includes `remediationSimulationHiFiInvoked` and `remediationSimulationHiFiRowCount`.
