# P78 — Execution report

## Mission outcome

**A — Achieved:** Canonical ML evaluation for **product 32690** now ends in **`remediated_pass`** with **`publishSafe: true`** (`winningRecipeId: inset_white_catalog_png`), without weakening policy/conversion gates.

## Code / data delivered

| Item | Purpose |
|------|---------|
| `candidate-scoring.service.ts` | `mergeCanonicalSupplementUrls`, `enumerateMainCandidates` keeps non-AE HTTP URLs, `scoreImageCandidateFromBuffer` |
| `ml-chile-canonical-pipeline.service.ts` | Optional local pack scoring; synthetic `local:pack:product-{id}:cover_main`; buffer load for remediation; `orderedUrls` uses absolute path for local winner |
| `scripts/p78-enable-canonical-local-cover-32690.ts` | Sets **32690** `productData.mlImagePipeline` flags + `insetCrop` |
| `src/utils/__tests__/candidate-scoring-enumerate.test.ts` | Regression tests for enumeration / supplement merge |

## Operational steps executed

1. Ran enable script (DB update for 32690).  
2. Ran `check-ml-image-remediation.ts 32690` until `remediated_pass`.  
3. Verified `artifacts/ml-image-packs/product-32690/ml-asset-pack.json` reflects `canonical_pipeline_v1`.

## Documentation

All `docs/P78_*.md` files from the P78 checklist are present alongside this report.
