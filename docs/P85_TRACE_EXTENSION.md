# P85 — Trace extension

## New fields (`CanonicalPipelineTrace`)

| Field | When set |
|-------|-----------|
| `finalCoverProvisionalWinner` | Same as preference winner when floor **enabled** and evaluated (preference path); legacy path sets from single pass. **Null** when floor disabled. |
| `commercialFinalistFloorEnabled` | `true` when floor ran; `false` when disabled. |
| `commercialFinalistFloorPass` | `true` / `false` after evaluation; **`null`** when floor disabled or not reached (e.g. direct pass). |
| `commercialFinalistFloorFailureReasons` | Populated when floor runs and fails; else `[]`. |

## Steps

- `commercial_finalist_floor_pass:{recipeId}:{objectKey}`
- `commercial_finalist_floor_reject:{reason1|reason2|…}`

## On floor fail

- `finalCoverPreferenceWinner` remains the **relative** winner (audit).
- `winningRecipeId` / `winningRemediationCandidateUrl` are **null** (no publish winner).
- Reasons in `human_review_required` include `ml_canonical_commercial_finalist_floor_failed` plus metric-specific strings (e.g. `floor_readability_below_min_55_got_49.26`).

## Check script

`p77Summary` exposes `finalCoverProvisionalWinner`, `commercialFinalistFloorEnabled`, `commercialFinalistFloorPass`, `commercialFinalistFloorFailureReasons`.
