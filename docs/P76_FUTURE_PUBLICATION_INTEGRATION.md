# P76 — Future publication integration

## Default inheritance

When **`ML_CANONICAL_IMAGE_PIPELINE`** is **not** disabled, **every** call to **`runMercadoLibreImageRemediationPipeline`** runs **`runMlChileCanonicalPipeline` first** (unless `decision.remediationPathSelected === 'reject_hard'`, e.g. no images — canonical is skipped to avoid redundant work).

Downstream callers **do not** need separate feature flags beyond the env var.

## Entry points (current)

| Caller | Role |
|--------|------|
| **`resolveMercadoLibrePublishImageInputs`** | Used by **`mercadolibre.publisher.ts`** for listing images |
| **`pre-publish-validator.service.ts`** | Validates ML image remediation before publish |
| **`backend/scripts/check-ml-image-remediation.ts`** | Operational diagnostic |

## Artifacts

- **Pack path**: `artifacts/ml-image-packs/product-{productId}/` via `getCanonicalMercadoLibreAssetPackDir`.
- **Canonical pack write**: `writeCanonicalP76Pack` — `cover_main.jpg|png`, `detail_mount_interface.jpg`, `ml-asset-pack.json`, optional `usage_context_clean.prompt.txt`.

## Disabling canonical behavior

- Set **`ML_CANONICAL_IMAGE_PIPELINE=false`** (or **`0`**) to restore **legacy-only** remediation for ML Chile flows.

## Non-ML marketplaces

- P76 canonical module is **ML Chile–first**. eBay and others remain on their existing pipelines until a profile + wiring mirror is added.
