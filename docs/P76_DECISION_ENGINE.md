# P76 — Decision engine (canonical ML Chile v1)

## Required order (implemented)

Implemented in **`runMlChileCanonicalPipeline`** (`backend/src/services/marketplace-image-pipeline/ml-chile-canonical-pipeline.service.ts`):

1. **Enumerate** real main candidates (URLs from product images).
2. **Apply** implicit marketplace filters via scoring + gates (no separate filter pass beyond enumeration rules).
3. **Rank** by `combinedScore` (descending).
4. For each ranked candidate, **evaluate Policy Gate + Conversion Gate** on the **raw** scored candidate.
5. If **both pass**: return **`raw_ordered`** — reorder gallery so the winning URL is first; **no remediation**.
6. If **no** direct pass: sort by **`remediationPotential`** (descending), then for each candidate apply **profile `defaultRemediationRecipeChain`** in order (skip inset recipe without `insetCrop` override).
7. After each recipe, **re-evaluate dual gate on output buffer**; on first **both pass**, build **`pack_buffers`** (cover + square JPEG detail).
8. If **exhausted**: return **`human_review_required`** with trace and reasons.

## Integration layer

- **`runMercadoLibreImageRemediationPipeline`** (`mercadolibre-image-remediation.service.ts`) invokes the canonical run when the feature flag allows; on **`human_review_required`** it **does not** fall through to legacy auto-remediation (fail closed). On **`raw_ordered`** / **`pack_buffers`**, legacy remediation paths are **skipped**.

## Traceability

- **`CanonicalPipelineTrace`**: steps, ranked candidates (policy/conversion fitness), chosen direct URL, remediation attempts (recipe + gate results).
