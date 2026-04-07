# P84 — Trace extension

## New `CanonicalPipelineTrace` fields

| Field | Meaning |
|-------|---------|
| `finalCoverPreferenceEnabled` | Whether P84 path was active |
| `finalCoverPreferenceMaxFinalists` | Cap used (0 when disabled) |
| `finalCoverPreferencePlanSlots` | Count of simulation plan entries (0 if no sim rows) |
| `finalCoverPreferenceFinalists` | Each passing final: scores + `finalCoverQuality` + reasons |
| `finalCoverPreferenceWinner` | Chosen `(candidateUrl, objectKey, recipeId, preferenceScore)` |
| `finalCoverPreferenceBeatReasons` | e.g. `compared_N_finalists`, `winner_score_…`, per-runner-up deltas |

## Steps

- `final_cover_preference:attempts=…:passing=…:plan=…`
- `final_cover_preference_winner:…:score=…`
- `final_cover_preference_zero_passing` when preference on but no passing finals
- Per attempt: `remediation_attempt:{objectKey}:{recipeId}:…`

## Check script

`scripts/check-ml-image-remediation.ts` — `p77Summary` includes finalist count, winner, beat reasons.
