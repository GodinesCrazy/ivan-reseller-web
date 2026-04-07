# P81 — Pipeline decision update (source selection before remediation)

## What changed (canonical ML Chile pipeline)

In `backend/src/services/marketplace-image-pipeline/ml-chile-canonical-pipeline.service.ts`:

1. **Direct path remains unchanged**
   - Direct acceptance still requires: `policy && conversion && hero && integrity`.

2. **Remediation candidate ordering is updated**
   - Before P81: remediation candidates were tried in descending `scores.remediationPotential`.
   - Now (P81): remediation candidates are tried in descending `scores.remediationFitness`.

This is the pre-remediation “ease-of-fix” selection layer.

## Exact new behavior

When canonical direct pass fails, the pipeline:

1. Sorts candidates by `scores.remediationFitness` (best-to-fix first).
2. For each candidate, iterates the configured remediation recipe chain.
3. Still enforces *all gates* on the remediation output:
   - `evaluateDualGatesOnOutputBuffer`
   - `evaluateHeroCoverQualityOnBuffer`
   - `evaluateOutputIntegrityOnBuffer`
4. A passing remediation output still returns immediately (no gate weakening).

## Why this satisfies the mission intent

P81 explicitly biases “which base image to remediate next” toward candidates that are easier to convert into a strong portada, rather than using a texture/edge proxy.

If a top remediable candidate produces a weak/invalid output (fails gates), the pipeline naturally tries the next viable candidate in the fitness order.

