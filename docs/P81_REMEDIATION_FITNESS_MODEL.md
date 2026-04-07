# P81 — Remediation fitness model (ease-of-fix)

## Goal

Provide an explicit scoring model that answers:

> “Given this source image, how likely is it that remediation will produce a strong portada (subject clarity + crop survivability + expected hero strength)?”

This score is computed *before* remediation using the same deterministic, operator-debuggable image-statistics pipeline used for candidate scoring.

## What P81 considers (as implemented)

The new field is:

- `scores.remediationFitness` (0..100)

and it is accompanied by:

- `remediationFitnessReasons: string[]` (traceability)

in `backend/src/services/marketplace-image-pipeline/candidate-scoring.service.ts`.

## Implemented signals

The score uses existing “policy-ish” / “conversion-ish” stats plus an additional trim-based predictor:

1. **Text/logo contamination severity (proxy)**: `textLogoRisk`
2. **Background cleanup difficulty (proxy)**: `backgroundSimplicity`
3. **Subject separation clarity (predictor)**: trim-based ratios using `sharp(...).trim({ threshold })`
   - `trimSubjectAreaRatio`
   - `trimWidthRatio`, `trimHeightRatio`
   - `trimExtentBalance`
4. **Crop survivability / recognizability (proxy)**: `productOccupancy` and `centeringBalance`
5. **Near-blank avoidance (proxy)**: large penalties when texture is weak and mean is very bright
6. **Trim false-positive risk (proxy)**: penalties when trim suggests a near full-canvas “subject” *and* texture is weak

## Formula (exact weighting in code)

Let:

- `trimSuccessScore` be derived from predicted trim ratios and the P79 hero thresholds.
- `nearBlankRiskPenalty` and `fullCanvasTrimPenalty` be heuristic penalties.

Then:

`remediationFitness = clamp(0..100, raw - nearBlankRiskPenalty - fullCanvasTrimPenalty)`

where:

`raw =
  (trimSuccessScore * 0.48)
  + (backgroundSimplicity * 0.16)
  + ((100 - textLogoRisk) * 0.14)
  + ((productOccupancy * 0.14 + centeringBalance * 0.12))
  + (remediationPotential * 0.08)`

Trim predictor score:

- `subjectAreaScore = clamp01(trimSubjectAreaRatio / heroMinSubjectAreaRatio) * 100`
- `wScore = clamp01(trimWidthRatio / heroMinSubjectWidthRatio) * 100`
- `hScore = clamp01(trimHeightRatio / heroMinSubjectHeightRatio) * 100`
- `eScore = clamp01(trimExtentBalance / heroMinExtentBalance) * 100`
- `trimSuccessScore = subjectAreaScore*0.42 + wScore*0.18 + hScore*0.18 + eScore*0.22`

Penalty proxies:

- `nearBlankRiskPenalty` applies when `edge.meanRgb > 235` AND `edge.avgStdev < 10` AND `center.stdevRgb < 12`
  - penalty: `55`
- `fullCanvasTrimPenalty` applies when `trimSubjectAreaRatio >= outputIntegrityGate.minSubjectAreaRatioForTrimSuspicion`
  - if `edge.avgStdev < 10`: `40`
  - else if `edge.avgStdev < 18`: `25`

## Trace reasons (operator readability)

`remediationFitnessReasons` includes deterministic strings like:

- `remFit_text_logo_risk_{rounded}`
- `remFit_background_simplicity_{rounded}`
- `remFit_pred_trim_area_{area}_extent_{balance}`
- `remFit_predicted_hero_pass` or `remFit_predicted_hero_fail_{first_failure}`

These reasons are stored in trace and also embedded into pipeline `steps` for remediation ordering.

