# P81 — Future publication inheritance

## Default-on inheritance path

`remediationFitness` is computed inside:

- `backend/src/services/marketplace-image-pipeline/candidate-scoring.service.ts`

and the remediation ordering is used inside:

- `backend/src/services/marketplace-image-pipeline/ml-chile-canonical-pipeline.service.ts`

There is no separate env toggle for P81.

Therefore, any future ML publication that runs the canonical MercadoLibre ML Chile pipeline (`runMlChileCanonicalPipeline`) inherits:

- `scores.remediationFitness` computation
- fitness-based remediation candidate ordering
- traceability fields:
  - `remediationFitnessReasons`
  - `winningRemediationCandidateUrl`

## What this protects

Future ML publications will not regress to “least bad base image” heuristics for remediation ordering; they will always prefer “best-to-fix” candidates first (unless a candidate is un-loadable or fails the existing publish gates).

