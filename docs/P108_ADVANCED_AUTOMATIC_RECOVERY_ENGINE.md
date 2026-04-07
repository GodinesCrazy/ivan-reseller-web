# P108 — Advanced automatic recovery engine

## Location

**`backend/src/services/ml-portada-advanced-recovery.service.ts`**

## Behavior

Operates on the **isolated RGBA cutout** (output of `isolateProductSubjectToPng`) **before** `composePortadaHeroWithRecipe`.

## Recovery profiles (`PortadaRecoveryProfileId`)

| ID | Operation |
|----|-----------|
| `p108_none` | No change (same buffer reference). |
| `p108_feather_alpha_light` | 3×3 box blur on **alpha** × 2 passes. |
| `p108_feather_alpha_medium` | Box blur on **alpha** × 5 passes. |
| `p108_alpha_erode1_feather` | 3×3 **minimum** filter on alpha, then blur × 2. |
| `p108_alpha_dilate1_feather` | 3×3 **maximum** filter on alpha, then blur × 2. |

RGB channels are unchanged; only alpha is processed, then written back to a new PNG.

## Integration

**`attemptMercadoLibreP103HeroPortadaFromUrls`** nests:

`for each recovery profile → for each portada recipe → gates`

## Controls

- **Default on:** unless `ML_P108_ADVANCED_RECOVERY=0|false`.
- **Per call:** `options.advancedRecovery: false` forces **`p108_none`** only.
- **Custom order:** `options.recoveryProfileOrder`.

## Trace

Each `recipeTrials[]` entry includes **`recoveryProfileId`**. Result may include **`winningRecoveryProfileId`**.
