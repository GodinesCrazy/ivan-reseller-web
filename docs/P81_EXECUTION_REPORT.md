# P81 — Execution report

## Mission

Fix the remaining selection weakness in the canonical MercadoLibre ML Chile image pipeline:

- the system could choose a remediation base image that is not the easiest-to-transform source
- even when remediation output passes the technical gates, the final cover can still be commercially weak

P81 makes the pre-remediation selection explicitly “best-to-fix”.

## Status

Complete — remediation source selection now uses `remediationFitness` and is traceable end-to-end.

## What changed (implementation)

1. `backend/src/services/marketplace-image-pipeline/candidate-scoring.service.ts`
   - added `scores.remediationFitness`
   - added deterministic `remediationFitnessReasons` for traceability

2. `backend/src/services/marketplace-image-pipeline/ml-chile-canonical-pipeline.service.ts`
   - remediation ordering switched from `remediationPotential` to `remediationFitness`
   - added trace steps:
     - `remediation_candidate_try:...:remFit=...:{reason1}|{reason2}|{reason3}`
   - added `trace.winningRemediationCandidateUrl` when remediation succeeds

3. `backend/src/services/marketplace-image-pipeline/types.ts`
   - extended candidate + trace types with:
     - `remediationFitnessReasons`
     - `winningRemediationCandidateUrl`

4. `backend/scripts/check-ml-image-remediation.ts`
   - surfaces `winningRemediationCandidateUrl` in `p77Summary`

5. Tests
   - added `remediation-fitness-selection.service.test.ts`

## Real SKU validation (32690)

Using `p81_32690_check2.json` evidence:

- `trace.finalOutcome = remediated_pass`
- `winningRecipeId = inset_white_catalog_png`
- `winningRemediationCandidateUrl = https://ae01.alicdn.com/kf/Sd8adf1f1f796411e96d94f9f8c6d45440.jpg`
- top-to-fix candidate `s2eee0...` was tried first (higher remFit) but failed to produce a publishable cover; the pipeline moved to the next viable candidate.

## Inheritance

`remediationFitness` is computed from the canonical profile and used by the canonical pipeline by default, so future ML publications inherit the behavior automatically.

