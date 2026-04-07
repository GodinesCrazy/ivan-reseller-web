# P85 — Future publication inheritance

## Default-on

`isCommercialFinalistFloorEnabled()` is **true** unless `ML_COMMERCIAL_FINALIST_FLOOR` is `0` or `false`.

Every future ML Chile canonical **remediation** (P84 preference path or legacy first-pass) evaluates the floor before returning `pack_buffers`.

## Operator override

- **Disable floor:** `ML_COMMERCIAL_FINALIST_FLOOR=0` (break-glass only).
- **Tune thresholds:** `ML_COMMERCIAL_FLOOR_*` env vars (see `backend/env.local.example`).

## Benefit

Publications no longer depend solely on “best of a bad set”; the winner must clear an **absolute** commercial minimum or stop for human review with explicit metric reasons in trace.
