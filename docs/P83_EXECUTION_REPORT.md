# P83 — Execution report

## Mission

Calibrate P82 simulation ranking so the **simulated winner** better predicts **final commercial portada quality**, without weakening Policy / Conversion / Hero / Integrity on publish.

## Status

Complete.

## Delivered

1. `simulation-quality-metrics.service.ts` — `evaluateSimulationQualityOnBuffer`, `computeSimScoreBase`, `computeCalibratedSimScore`.
2. Extended `CanonicalRemediationSimulationDetail` + `CanonicalSimulationQualityMetrics` + trace hi-fi counters (`types.ts`).
3. `applyRecipePreview(..., fidelity)` + high-fidelity preview recipe sizes (`remediation-recipes.service.ts`).
4. Two-phase simulation (low shortlist + hi-fi top N) + calibrated winner (`remediation-simulation.service.ts`).
5. Env helpers (`policy-profiles.ts`), pipeline wiring + step string (`ml-chile-canonical-pipeline.service.ts`), check script fields, `env.local.example`.
6. Tests + docs (`__tests__/simulation-quality-metrics.service.test.ts`, updated simulation tests, `docs/P83_*.md`).

## Proof

- Forced 32690 run: `remediationSimulationRows: 14`, `hifiRows: 4`, winner `simScoreBase` vs calibrated `simScore` documented in `P83_REAL_SKU_REVALIDATION.md`.

## Non-negotiables

- Final publish path gates unchanged.
