# P80 — Output integrity gate design

## Purpose

Block **near-blank / near-uniform-white** covers using **pixel-level** statistics on a deterministic downsample, **independent** of Sharp trim. This closes the loophole where hero trim assumes the whole canvas is the subject.

## Inputs

- Image buffer (same as evaluated by policy/conversion/hero on that path).
- Policy thresholds: `MarketplaceImagePolicyProfile.outputIntegrityGate` (`ML_CHILE_POLICY_PROFILE_V1`).
- Optional **hero metrics** for a single composite rule: suspected trim-full-canvas with almost no ink.

## Processing

1. `sharp(buf).rotate().resize(fit: inside, max dimension).flatten(white).raw()`.
2. Per pixel: luminance, chroma, “near white” (RGB ≥ `nearWhiteRgbThreshold`), “signal” (luma/chroma rules; see code).
3. Aggregate: mean L, stdev L, signal ratio, near-white ratio, luminance range.

## Hard rules (all contribute failure strings)

1. **Signal floor:** `signalPixelRatio < minSignalPixelRatio`.
2. **Near-white ceiling:** `nearWhitePixelRatio > maxNearWhitePixelRatio`.
3. **Uniform bright field:** if `meanLuminance ≥ meanLuminanceTriggersStdevCheck` and `luminanceStdev < minLuminanceStdevWhenMeanHigh`.
4. **Weak global contrast:** `luminanceRange < minLuminanceRange`.
5. **Trim suspicion:** if `hero.subjectAreaRatio ≥ minSubjectAreaRatioForTrimSuspicion` and `signalPixelRatio < minSignalPixelRatioWhenSubjectFullCanvas` and `meanLuminance ≥ trimSuspicionMeanLuminanceMin` → `integrity_suspected_trim_full_canvas_with_low_visible_ink_…`.

## Non-goals

- Does not relax or replace Policy, Conversion, or Hero gates.
- Does not attempt semantic “is this a product” — only **physical pixel sufficiency**.

## Break-glass

`ML_OUTPUT_INTEGRITY_GATE=0` or `false` disables the gate (same pattern as `ML_HERO_COVER_GATE`). Default: **enabled**.

## Implementation

`backend/src/services/marketplace-image-pipeline/output-integrity-gate.service.ts`
