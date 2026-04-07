# P109 — V2 portada recipe families

## Cartesian product (conceptual)

For each **ranked supplier (or planned) source** that reaches isolation:

```
FOR segmentationVariant IN segmentationVariantOrder
  FOR studioPrep IN studioPrepOrder
    FOR recoveryProfile IN recoveryProfileOrder   // P108 waves
      FOR recipeId IN recipeOrder                 // P107 compose recipes
        → compose hero → run same strict ML gate stack as before
```

Any candidate must pass **all** existing gates (anti-text/logo, white field, natural look, anti-collage/sticker, hero/composition, integrity). **No relaxed gates** in V2.

## Default orders (when P109 enabled)

- **Segmentation** (`DEFAULT_P109_SEGMENTATION_ORDER`):  
  `p103_v1_default` → `p109_border_relaxed` → `p109_mask_minimal_spread` → `p109_soft_alpha_blur`

- **Studio prep** (`DEFAULT_P109_STUDIO_PREP_ORDER`):  
  `p109_none` → `p109_halo_light` → `p109_halo_medium`

- **Recovery** (P108): from `resolveRecoveryProfileOrder(advancedRecovery)` when `advancedRecovery` is true.

- **Recipes** (P107): `DEFAULT_AUTOMATIC_PORTADA_RECIPE_ORDER` when `multiRecipe` is true.

## Readiness family label

`buildPortadaAutomationReadinessFromP103` sets:

- **`p109_seg_x_studio_x_p108_x_p107`** when more than one segmentation variant **or** more than one studio prep id was in the attempted lists (P109-shaped run).

## Benchmark fast mode

`P109_BENCHMARK_FAST=1` shrinks segmentation, studio, and recovery lists for quicker smoke runs (see [P109_PRODUCT_32714_V2_BENCHMARK.md](./P109_PRODUCT_32714_V2_BENCHMARK.md)).
