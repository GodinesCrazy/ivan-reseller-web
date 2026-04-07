# P76 — Remediation pipeline (recipes)

## Model

Remediation is a **named recipe registry** with **metadata** (id, label, safe defaults, compatible marketplaces/sites) and **implementations** that return image buffers.

- **File**: `backend/src/services/marketplace-image-pipeline/remediation-recipes.service.ts`
- **Registry**: `REMEDIATION_RECIPES` — documents intent per recipe; **`applyRecipe`** checks **profile `compatibleRecipeIds`** before running (no silent incompatible apply).

## Recipes (v1)

| Recipe id | Intent |
|-----------|--------|
| `square_white_catalog_jpeg` | Square canvas, white background, JPEG catalog look |
| `inset_white_catalog_png` | Inset crop + white catalog (requires **`productData.mlImagePipeline.insetCrop`** fractions) |

## DAG / ordering

- Ordering is the profile’s **`defaultRemediationRecipeChain`** (not a general DAG engine yet). Stages are **sequential per candidate**; the engine moves to the **next candidate** only after the chain fails for the current one.

## Post-conditions

- Each recipe output is validated with **`evaluateDualGatesOnOutputBuffer`** before acceptance.
