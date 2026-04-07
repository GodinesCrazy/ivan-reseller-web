# P84 — Final cover preference model

## Code

`backend/src/services/marketplace-image-pipeline/final-cover-preference.service.ts`

## Inputs

Only **gate-passing** remediated cover buffers enter preference scoring. Hero and integrity metrics used are those from the same evaluation that passed (no relaxed thresholds).

## Metrics

`evaluateFinalCoverPreferenceOnBuffer` reuses `evaluateSimulationQualityOnBuffer` (P83) on the **full-resolution** remediated output to produce `CanonicalSimulationQualityMetrics`:

- `deadSpaceRatio`, `centerSignalRatio`, `globalLuminanceStdev`, `edgeTextureStdev`, `washoutIndex`, `silhouetteStrength`, `readabilityEstimate`

## `preferenceScore` (soft ranking only)

`computeFinalCoverPreferenceScoreFromSignals` combines:

- `readabilityEstimate * 1100`
- `silhouetteStrength * 520`
- `centerSignalRatio * 58_000`
- minus `washoutIndex * 118_000`
- minus `deadSpaceRatio * 36_000`
- `min(subjectWidthRatio, subjectHeightRatio) * 14_000`
- `subjectAreaRatio * 26_000`
- `extentBalance * 8_000`
- edge texture soft penalty above **38** stdev (preference-only; main-slot policy gate remains unchanged)

## Hard reject vs preference

- **Hard:** unchanged dual gate + hero + integrity on each attempt.
- **Preference:** applied only among attempts that already passed all hard checks.

## Trace

Per finalist: `preferenceScore`, `preferenceReasons`, `finalCoverQuality` (metric snapshot).
