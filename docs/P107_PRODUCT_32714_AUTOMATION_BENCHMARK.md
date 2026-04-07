# P107 — Product 32714 automation benchmark

## Command

```text
cd backend
npx tsx scripts/p107-automatic-portada-benchmark-32714.ts
```

## Method

- Loads product **32714** from DB.
- Uses **7** real AliExpress URLs from `products.images`.
- **Strips** `portadaSupplementHeroUrl` / `portadaSupplementHeroWorkspaceRelativePath` **in memory only** (does not write DB).
- Runs **`attemptMercadoLibreP103HeroPortadaFromUrls`** with **`multiRecipe: true`** and default recipe order.

## Artifact

**`p107-benchmark-32714.json`** (repo root) — includes `rankedSources`, full `trials` with `recipeTrials`, `lastTrialRecipeSummary`, `automaticPortadaClassification`.

## Result (2026-03-27 run)

- **`p103Ok`:** `false`
- **`automaticPortadaClassification`:** `IMAGE_SOURCE_INSUFFICIENT_FOR_MARKETPLACE`
- **`coverSha256`:** `null` (no compliant portada)
- **Observation:** For the **last** source tried, **all six** recipes failed **strict+natural** (signals include harsh silhouette / white dominance / border issues depending on recipe). Same pattern across sources: isolation often succeeds; **gates** reject every variant.

## Conclusion for 32714

Under the **current** automatic engine (multi-recipe included), the **supplier set alone** does **not** yield a passing portada. The benchmark **honestly confirms** source-limited behavior for this product **without** manual hero input.
