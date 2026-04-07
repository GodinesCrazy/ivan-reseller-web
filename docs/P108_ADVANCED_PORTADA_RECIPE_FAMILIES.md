# P108 — Advanced portada recipe families

## Family A — P107 canvas recipes (unchanged)

Six compose variants: white @ 72/76/78/85% subject scale, neutral **249** and light gray **246** backgrounds (`ml-portada-recipes.service.ts`).

## Family B — P108 recovery × Family A (automatic Cartesian product)

For **each** supplier source (after isolation):

1. **`p108_none`** + all six recipes  
2. **`p108_feather_alpha_light`** + all six  
3. **`p108_feather_alpha_medium`** + all six  
4. **`p108_alpha_erode1_feather`** + all six  
5. **`p108_alpha_dilate1_feather`** + all six  

Stopping at the **first** full pass (strict+natural → hero → integrity).

## Analytics label

**`portadaAutomationRecipeFamily`** in readiness:

- `p107_multi_recipe_x_p108_recovery_waves` when multiple recovery profiles ran.  
- `p107_multi_recipe_only` when advanced recovery is off (none-only wave).

## Philosophy

Every variant is subject to the **same** gate stack; there is no “soft publish” path.
