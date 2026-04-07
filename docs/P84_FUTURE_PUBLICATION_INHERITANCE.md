# P84 — Future publication inheritance

## Default-on

`isFinalCoverPreferenceEnabled()` is **true** unless `ML_FINAL_COVER_PREFERENCE` is `0` or `false`.

All future ML Chile canonical runs that enter **remediation** with preference enabled will:

1. Try ordered `(candidate, recipe)` pairs up to bounded passing finals.
2. Prefer the strongest `preferenceScore` when **two or more** finals pass.

## Direct pass

Unchanged: SKUs that pass on a direct candidate never hit remediation or final preference.

## Tuning

- `ML_FINAL_COVER_PREFERENCE_MAX_FINALISTS` — trade off compute vs chance of capturing more passing variants (2–5).
