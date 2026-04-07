# P82 — Trace extension

## New trace fields (`CanonicalPipelineTrace`)

| Field | Purpose |
|-------|---------|
| `remediationSimulation` | Array of per-(candidate, recipe) preview rows with passes/failures/metrics/scores |
| `remediationSimulationWinner` | Best preview row by `simScore` (may still be non-passing if all weak) |
| `remediationSimulationAllWeak` | `true` if no preview row had `simAllCorePass` |

## New step strings

- `remediation_simulation:shortlist={n}:rows={m}:allWeak={bool}`
- `remediation_simulation_rank:{objectKey1}>{objectKey2}>…` — final attempt order for the shortlist slice

## Check script surfacing

`backend/scripts/check-ml-image-remediation.ts` adds to `p77Summary`:

- `remediationSimulationRows`
- `remediationSimulationWinner`
- `remediationSimulationAllWeak`

## Row contents (debugging)

Each `CanonicalRemediationSimulationDetail` includes:

- `simPolicyPass`, `simConversionPass`, `simBothPass`
- `simHeroPass`, `simIntegrityPass`, `simAllCorePass`
- `simScore`
- snapshots of `heroMetrics` and `integrityMetrics`
- failure string arrays for each gate layer
