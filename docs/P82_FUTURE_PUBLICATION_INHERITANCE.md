# P82 — Future publication inheritance

## Default-on

Simulation ranking runs whenever:

- `ML_CANONICAL_IMAGE_PIPELINE` is enabled (existing behavior), and
- `ML_REMEDIATION_SIMULATION` is **not** explicitly disabled.

No per-SKU flag is required.

## What future ML publications inherit

- Automatic **preview remediation** shortlist evaluation before committing attempt order on the remediation branch.
- Persistent trace artifacts (`remediationSimulation`, winner, `allWeak`) for operator and CI/debug review.
- Tunable limits via env (`ML_REMEDIATION_SIM_MAX_CANDIDATES`, `ML_REMEDIATION_SIM_PREVIEW_MAX_INPUT`) without code changes.

## Operational note

When a SKU **direct-passes**, simulation rows remain empty by design — there is no remediation branch to optimize.
