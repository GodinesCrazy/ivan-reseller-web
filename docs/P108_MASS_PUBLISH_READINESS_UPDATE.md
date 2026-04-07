# P108 — Mass-publish readiness update

## Extended `portadaAutomation` (metadata patch)

Built by **`buildPortadaAutomationReadinessFromP103`** when remediation runs P103:

| Field | P108 addition |
|--------|----------------|
| `winningRecoveryProfileId` | Winning `p108_*` profile or `null`. |
| `advancedRecoveryEnabled` | Whether multi-wave recovery was enabled for the attempt. |
| `recoveryProfilesAttempted` | Ordered list of profile ids (e.g. five entries). |
| `portadaAutomationRecipeFamily` | `p107_multi_recipe_x_p108_recovery_waves` vs `p107_multi_recipe_only`. |
| `classification` | New value **`AUTOMATIC_ADVANCED_RECOVERY_EXHAUSTED`** when all recovery waves and recipes fail (supplier path). |

Existing fields (`publishAllowedPortada`, `topRejectionSignals`, `winningRecipeId`, etc.) unchanged in meaning.

## Publish policy hint

- **`AUTOMATIC_ADVANCED_RECOVERY_EXHAUSTED`** — autonomous engine exhausted **both** recipe and alpha-recovery families; treat as **strong no-publish** from automatic portada unless a separate human-approved pack path applies.
- **`IMAGE_SOURCE_INSUFFICIENT_FOR_MARKETPLACE`** — reserved when **P108 is disabled** (`advancedRecovery` false / env off) and automation still fails.

## Env

- **`ML_P108_ADVANCED_RECOVERY`:** unset = enabled; `0` or `false` = P107-only behavior (single `p108_none` wave).
