# P86 — Future publication inheritance

## Defaults

`getCommercialFinalistFloorThresholds()` still reads env first, then falls back to **`COMMERCIAL_FINALIST_FLOOR_DEFAULTS`** — now **P86-calibrated** in code.

## Default-on

`isCommercialFinalistFloorEnabled()` remains default **on**; no behavior change to inheritance, only **stricter calibrated defaults** when env is unset.

## Operations

- Ship with code defaults for new deployments.
- Tune per marketplace or season via `ML_COMMERCIAL_FLOOR_*` without redeploying logic.
- Grow `artifacts/ml-calibration/` JSON exports as human labels arrive; periodically re-run `docs/P86_THRESHOLD_CALIBRATION_ANALYSIS.md` style review and adjust defaults in a future sprint.
