# P107 — Multi-recipe portada generation

## Recipe catalog

Defined in **`ml-portada-recipes.service.ts`** (`listAutomaticPortadaRecipeSpecs()`):

| ID | Subject max (× canvas) | Background |
|----|-------------------------|------------|
| `p107_white_078` | 0.78 | RGB(255,255,255) |
| `p107_white_072` | 0.72 | white |
| `p107_white_076` | 0.76 | white |
| `p107_white_085` | 0.85 | white |
| `p107_neutral_f9_078` | 0.78 | RGB(249,249,248) |
| `p107_light_gray_f6_078` | 0.78 | RGB(246,246,246) |

## Algorithm

For each **trial source** (after successful isolation):

1. Iterate **`DEFAULT_AUTOMATIC_PORTADA_RECIPE_ORDER`** in order.
2. Compose portada → run **strict+natural → hero → integrity**.
3. On first full pass, return **`ok: true`** with **`winningRecipeId`**.
4. If all recipes fail, append one **`P103HeroTrialTrace`** with full **`recipeTrials`** and continue to next source.

## Future extensions (not in this sprint)

- Alpha feather / edge cleanup passes before compose.
- True soft-drop-shadow layer (needs careful alpha-aware blur).
- Additional “catalog-safe” background tones per category profile.
