# P85 — Commercial finalist floor model

## Code

`backend/src/services/marketplace-image-pipeline/commercial-finalist-floor.service.ts`

## Decision rule

1. **Preference unchanged (P84):** select provisional winner among passing finalists (or single pass / legacy first pass).
2. **Floor (P85):** If `isCommercialFinalistFloorEnabled()` (default **on**), evaluate `evaluateCommercialFinalistFloor` on the **provisional winner’s**:
   - `preferenceScore`
   - `finalCoverQuality` (`CanonicalSimulationQualityMetrics` from full-res buffer)
   - `heroMetrics` snapshot (subject dominance)
3. **All** of the following must hold (AND). Any failure → **hard commercial floor fail** (human review, no pack).

## Default thresholds (`COMMERCIAL_FINALIST_FLOOR_DEFAULTS`)

| Check | Default | Meaning |
|-------|---------|---------|
| Readability | `minReadabilityEstimate ≥ 55` | `readabilityEstimate` |
| Silhouette | `minSilhouetteStrength ≥ 50` | contrast × signal proxy |
| Dead space | `deadSpaceRatio ≤ 0.52` | from quality metrics |
| Center | `centerSignalRatio ≥ 0.22` | focal product presence |
| Washout | `washoutIndex ≤ 0.52` | flat / pastel fog |
| Subject | `subjectAreaRatio ≥ 0.42` | aligns with hero gate floor |
| Preference | `preferenceScore ≥ 85_000` | composite floor on ranking score |

## Env overrides

`ML_COMMERCIAL_FLOOR_MIN_READABILITY`, `ML_COMMERCIAL_FLOOR_MIN_SILHOUETTE`, `ML_COMMERCIAL_FLOOR_MAX_DEAD_SPACE`, `ML_COMMERCIAL_FLOOR_MIN_CENTER_SIGNAL`, `ML_COMMERCIAL_FLOOR_MAX_WASHOUT`, `ML_COMMERCIAL_FLOOR_MIN_SUBJECT_AREA`, `ML_COMMERCIAL_FLOOR_MIN_PREFERENCE_SCORE`

## Disable floor (break-glass)

`ML_COMMERCIAL_FINALIST_FLOOR=0` or `false`.

## Distinction

- **Gates:** legal/technical compliance on buffer.
- **Preference:** order finalists.
- **Floor:** absolute commercial minimum on the **winner only**.
