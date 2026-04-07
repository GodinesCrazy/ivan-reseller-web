# P79 — Hero / cover quality gate design

## Name

**Hero Cover Quality Gate** (third mandatory gate in canonical ML Chile flow, after Policy + Conversion).

## Rules (ML Chile profile `heroCoverGate`)

Configured on **`ML_CHILE_POLICY_PROFILE_V1`** in `policy-profiles.ts`:

| Rule | Field | Role |
|------|--------|------|
| Minimum subject **area** share | `minSubjectAreaRatio` | `(trimW×trimH)/(W×H)` must be ≥ threshold |
| Minimum subject **width** share | `minSubjectWidthRatio` | `trimW/W` must be ≥ threshold |
| Minimum subject **height** share | `minSubjectHeightRatio` | `trimH/H` must be ≥ threshold |
| **Extent balance** (anti–thin-strip) | `minExtentBalance` | `min(rW,rH)/max(rW,rH)` must be ≥ threshold |
| Trim sensitivity | `trimThreshold` | Sharp trim threshold (1–99) |

## Current numeric thresholds (v1)

- `minSubjectAreaRatio`: **0.42**  
- `minSubjectWidthRatio`: **0.42**  
- `minSubjectHeightRatio`: **0.38**  
- `minExtentBalance`: **0.32**  
- `trimThreshold`: **14**

## Failure strings (examples)

- `hero_subject_area_ratio_X_below_Y`  
- `hero_subject_width_ratio_X_below_Y`  
- `hero_subject_height_ratio_X_below_Y`  
- `hero_extent_balance_X_below_Y_thin_or_strip_composition`  
- `hero_trim_failed_or_uniform_canvas`  
- `hero_source_buffer_unavailable` (direct path only)

## Hard vs soft

All of the above are **hard fails** for **`publishSafe`** when the hero gate is **enabled**.

## Disable policy (break-glass only)

Env **`ML_HERO_COVER_GATE=0`** or **`false`** disables the gate (see `isHeroCoverGateEnabled()`). Default is **on** when unset.
