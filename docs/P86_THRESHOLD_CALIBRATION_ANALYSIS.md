# P86 — Threshold calibration analysis

## Starter labeled rows

Source: `artifacts/ml-calibration/p86_starter_labeled_traces.json` (extracted from SKU 32690 forced remediation trace, two finalists).

| Metric | Good (winner) | Weak (runner-up) | Notes |
|--------|---------------|------------------|--------|
| readabilityEstimate | 65.67 | 49.26 | Clear gap |
| silhouetteStrength | 62.02 | 40.54 | Clear gap |
| centerSignalRatio | 0.5696 | 0.1113 | Clear gap |
| washoutIndex | 0.30 | **0.456** | Weak **passed** old floor max **0.52** alone |
| preferenceScore | 128,939 | 54,439 | Clear gap |
| deadSpaceRatio | ~0.296 | ~0.298 | **No separation** in this pair |
| subjectAreaRatio | ~0.704 | ~0.702 | **No separation** in this pair |

## Pre-P86 vs post-P86 defaults

| Threshold | Pre-P86 | Post-P86 | Rationale |
|-----------|---------|----------|-----------|
| minReadabilityEstimate | 55 | **58** | Raise midpoint between Weak and Good; Good still well above |
| minSilhouetteStrength | 50 | **52** | Slightly tighter; Good 62 still safe |
| maxDeadSpaceRatio | 0.52 | **0.50** | Minor tighten; starter pair unchanged (both pass) |
| minCenterSignalRatio | 0.22 | **0.22** | **Unchanged** — already rejects Weak; no loosening without more labels |
| maxWashoutIndex | 0.52 | **0.42** | **Key fix:** Weak 0.456 now fails washout floor |
| minSubjectAreaRatio | 0.42 | **0.42** | No evidence to move; align with hero gate |
| minPreferenceScore | 85,000 | **95,000** | Mid-gap between Weak and Good |

## What stayed lax / needs more data

- **Dead space / subject area:** the starter pair is nearly identical on these; future **Borderline** and cross-SKU rows should drive changes.
- **Center signal:** held at 0.22 until a labeled set shows false positives.
