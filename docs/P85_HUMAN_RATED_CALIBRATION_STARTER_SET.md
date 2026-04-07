# P85 — Human-rated calibration starter set

## Labels (minimal)

| Label | Operator question |
|-------|-------------------|
| **Good** | Would you ship this portada as main image without changes? |
| **Borderline** | Passes policy but you’d hesitate or want tweaks. |
| **Weak** | Should not go live without new art or heavy rework. |

## Sample size

Start with **20–40** SKUs spanning categories (inset vs square, busy vs clean supplier shots). Capture from trace: `finalCoverQuality`, `heroMetrics`, `preferenceScore`, and floor pass/fail.

## How ratings feed thresholds

1. **Floor:** For each metric, plot **good** vs **weak** distributions. Set defaults near the **lower bound of “good”** with margin, so most good pass and most weak fail.
2. **Preference weights (P84):** If good SKUs often lose preference ranking, nudge weights in `computeFinalCoverPreferenceScoreFromSignals`; floor stays the **safety net**.

## Operational rule

Prefer **tightening the floor** (stricter env) over disabling gates. Use `ML_COMMERCIAL_FINALIST_FLOOR=0` only as break-glass.

## No full ML model

Keep thresholds explicit, env-tunable, and traceable — no training pipeline required for v1.
