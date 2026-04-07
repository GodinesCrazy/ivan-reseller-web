# P107 — Mass-publish image readiness model

## `metadataPatch.portadaAutomation`

Written by **`runMercadoLibreImageRemediationPipeline`** when the P103/P107 rebuild path runs (`cover_main` invalid + URLs present + env not disabling P103).

Shape (from **`buildPortadaAutomationReadinessFromP103`**):

| Field | Meaning |
|--------|---------|
| **`publishAllowedPortada`** | `true` only if P103 attempt **`ok`**. |
| **`classification`** | `AUTOMATIC_COMPLIANT_PORTADA_PRODUCED` / `IMAGE_SOURCE_INSUFFICIENT_FOR_MARKETPLACE` / `SUPPLEMENT_HERO_CONFIGURED_FAIL_CLOSED` / `null` if no attempt. |
| **`winningRecipeId`** | Recipe id when automation succeeded. |
| **`winningSourceUrl`** | Winning supplier/canonical URL. |
| **`sourceTrialCount`** | Number of source-level trials. |
| **`recipeVariantsTriedOnLastSource`** | Length of last trial’s `recipeTrials`. |
| **`failClosedReason`** | P105/P103 fail-closed code when set. |
| **`supplementHeroConfigured`** | Whether metadata had supplement hero. |
| **`topRejectionSignals`** | Bounded slice of last failure signals (analytics). |

## Integration guidance

- **Publish orchestration** should treat **`publishAllowedPortada === false`** and **`classification === IMAGE_SOURCE_INSUFFICIENT_FOR_MARKETPLACE`** as **hard image block** for autonomous publish (unless a separate human-approved pack path applies).
- **Metrics:** aggregate `classification` and `topRejectionSignals[0]` across products for dataset quality feedback.

## Seller Center

Final moderation truth remains **Seller Center**; this model is **system-side readiness**, not a guarantee of ML acceptance.
