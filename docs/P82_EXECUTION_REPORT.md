# P82 — Execution report

## Mission

Upgrade canonical ML Chile remediation **candidate selection** from P81 heuristics to **simulation-based ranking**: preview remediation outputs, evaluate core gates on previews, rank sources by simulated strength, then run unchanged final remediation + production gates.

## Status

Complete.

## Delivered

1. Preview recipe implementations + `applyRecipePreview` (`remediation-recipes.service.ts`).
2. `evaluateSimulationDualGatesOnOutputBuffer` (`dual-gate.service.ts`).
3. `runRemediationSimulationRanking` (`remediation-simulation.service.ts`).
4. Pipeline integration + trace fields + human-review hint (`ml-chile-canonical-pipeline.service.ts`, `types.ts`).
5. Env + example template (`policy-profiles.ts`, `env.local.example`).
6. Check script summary fields (`check-ml-image-remediation.ts`).
7. Tests + docs (`remediation-simulation.service.test.ts`, `docs/P82_*.md`).

## Proof (32690)

Forced remediation capture shows `remediation_simulation_rank` leading with `sd8adf…` and `remediationSimulationWinner` matching the final winning source/recipe — see `docs/P82_REAL_SKU_REVALIDATION.md`.

## Non-negotiables

- Final publish path still uses full recipes + full output dual gate + hero + integrity — **not** weakened.
