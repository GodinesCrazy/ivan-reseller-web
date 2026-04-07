# P77 — Future-publication readiness check

## Default-on canonical pipeline

- **`ML_CANONICAL_IMAGE_PIPELINE`**: unset → **enabled**; `0` or `false` → disabled (`policy-profiles.ts` / `runMlChileCanonicalPipeline` early return).
- **Not accidental:** Disabling requires an explicit env value.

## Where it plugs in

| Location | Behavior |
|----------|----------|
| `runMercadoLibreImageRemediationPipeline` | Always runs canonical when enabled; merges trace into `metadataPatch.mlChileCanonicalPipeline` |
| `resolveMercadoLibrePublishImageInputs` | Uses pipeline result for ML publish image inputs |
| `mercadolibre.publisher.ts` | Calls `resolveMercadoLibrePublishImageInputs` |
| `pre-publish-validator.service.ts` | Calls `runMercadoLibreImageRemediationPipeline` for ML checks |
| `scripts/check-ml-image-remediation.ts` | Operational inspection + optional `--persist` |

## What future ML publications inherit

1. **Policy profile** (ML Chile v1) + **dual scoring** + **decision order** (direct → remediate → fail closed).  
2. **`integrationLayerOutcome`** + full **`trace`** for forensics.  
3. **P77 hardening:** **`reject_hard`** cannot reuse a stale pack without **env or `productData` override**.  
4. **`human_review_required`** cannot publish off an old pack while canonical says review.

## Operator disable path

- Set **`ML_CANONICAL_IMAGE_PIPELINE=false`** to fall back to **legacy-only** remediation (documented in `env.local.example`).
