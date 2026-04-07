# P107 — Automatic image normalization engine

## Purpose

Transform **supplier-only** inputs into a **1200×1200** Mercado Libre portada candidate using:

1. Existing **ranking** of loaded buffers.
2. **Isolation** (unchanged P103 segmentation).
3. **Multi-recipe reconstruction** (P107).
4. **Full gate stack** per recipe until one passes or sources are exhausted.

## API

- **`attemptMercadoLibreP103HeroPortadaFromUrls(imageUrls, options?)`**
  - **`multiRecipe`:** default **`true`**. Set **`false`** to restore single-recipe (`p107_white_078` only) behavior.
  - **`recipeOrder`:** optional override of `DEFAULT_AUTOMATIC_PORTADA_RECIPE_ORDER`.
- **`composeMercadoLibreP103HeroOnWhite`** — delegates to **`composePortadaHeroWithRecipe(..., LEGACY_P103_RECIPE_ID)`** for backward compatibility.

## Trace fields

- **`trials[].recipeTrials[]`:** per-recipe gate outcomes for that source.
- **`winningRecipeId`** on result when **`ok`**.
- **`automaticPortadaClassification`** on **`trace`** for success/failure taxonomy.

## Benchmark helper

- **`stripPortadaSupplementHeroFieldsForAutomaticBenchmark(productData)`** — in-memory strip of supplement fields to force supplier-only evaluation (see `p107-automatic-portada-benchmark-32714.ts`).
