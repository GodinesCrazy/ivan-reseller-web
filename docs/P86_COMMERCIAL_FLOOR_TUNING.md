# P86 — Commercial floor tuning

## Applied changes

**Source of truth:** `COMMERCIAL_FINALIST_FLOOR_DEFAULTS` in `backend/src/services/marketplace-image-pipeline/commercial-finalist-floor.service.ts`.

| Constant | Before (P85 hand-tuned) | After (P86 calibrated) |
|----------|-------------------------|-------------------------|
| `minReadabilityEstimate` | 55 | **58** |
| `minSilhouetteStrength` | 50 | **52** |
| `maxDeadSpaceRatio` | 0.52 | **0.50** |
| `minCenterSignalRatio` | 0.22 | **0.22** |
| `maxWashoutIndex` | 0.52 | **0.42** |
| `minSubjectAreaRatio` | 0.42 | **0.42** |
| `minPreferenceScore` | 85,000 | **95,000** |

## Env overrides (unchanged mechanism)

Same variables as P85; `backend/env.local.example` comments updated to reflect **P86 default targets** for copy/paste overrides.

## Break-glass

- Disable floor entirely: `ML_COMMERCIAL_FINALIST_FLOOR=0` or `false`.
- Per-metric tuning: `ML_COMMERCIAL_FLOOR_*` without code changes.

## Traceability

Floor failures still emit `commercialFinalistFloorFailureReasons` with `floor_*_min_*_got_*` / `floor_*_max_*_got_*` strings for operator review.
