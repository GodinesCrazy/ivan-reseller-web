# P76 — Current logic audit (vs R1 architecture)

## Summary

Prior to P76, MercadoLibre Chile image handling was split across **policy audit** (`mercadolibre-image-policy.service`), **remediation decision** (`evaluateMercadoLibreImageRemediationDecision`), **simple square-fit pack generation** (`autoGenerateSimpleProcessedPack`), and **manual / executor asset packs**. There was **no first-class per-marketplace policy profile**, **no conversion gate**, and **no ordered “try next candidate before heavy remediation”** loop aligned with R1.

## Where selection lived

- **Primary ordering** for publish inputs was effectively **supplier array order** (first image = cover), subject to policy flags, not a ranked candidate set with dual objectives.
- **`evaluateMercadoLibreImageRemediationDecision`** chose among `raw_images_publish_safe`, `internal_process_existing_images`, and `internal_generated_asset_pack` based on **policy audit status** and simple blocker sets (`SIMPLE_PROCESSABLE_BLOCKERS`), not on **conversion fitness** or **remediation potential** ranking.

## Where remediation lived

- **`autoGenerateSimpleProcessedPack`**: download cover + detail URLs, `squareFitToJpeg` — implicit single recipe, no named DAG, no per-recipe marketplace compatibility metadata.
- **Executor path**: prompt package + optional automated generation — orthogonal to catalog-style remediation.

## Policy vs conversion imbalance (R1 gap)

- **Over-weighted**: passing **policy-shaped** checks (dimensions, square-like, “least risky” raw pass) without a structured **conversion gate** (centering, occupancy, catalog look, clutter proxies).
- **Under-weighted**: **commercial quality** of the portada when policy said “pass” or when simple auto-square produced a **compliant but weak** hero.

## Listing-scoped vs reusable

| Area | Before P76 | P76 direction |
|------|------------|---------------|
| ML policy thresholds | Embedded in audit/heuristics | `MarketplaceImagePolicyProfile` (`policy-profiles.ts`) |
| Candidate ordering | URL order | Enumerate + score + rank (`candidate-scoring.service.ts`) |
| Gates | Implicit / policy-only | Explicit dual gate (`dual-gate.service.ts`) |
| Remediation | Ad hoc functions | Named recipes + chain (`remediation-recipes.service.ts`) |
| Wiring | `runMercadoLibreImageRemediationPipeline` only | Same entry + `runMlChileCanonicalPipeline` when enabled |

## Code references

- Legacy decision: `backend/src/services/mercadolibre-image-remediation.service.ts` — `evaluateMercadoLibreImageRemediationDecision`, `autoGenerateSimpleProcessedPack`.
- Canonical pipeline: `backend/src/services/marketplace-image-pipeline/`.
- Publish integration: `backend/src/modules/marketplace/mercadolibre.publisher.ts` — `resolveMercadoLibrePublishImageInputs`.
