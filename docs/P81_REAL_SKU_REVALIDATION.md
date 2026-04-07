# P81 — Real SKU re-validation (32690)

## Command

```bash
cd backend
npx tsx scripts/check-ml-image-remediation.ts 32690
```

To exercise the remediation-source selection path, the previous on-disk `artifacts/ml-image-packs/product-32690/cover_main.*` was removed before this run (so `local_approved_cover_main` could not be used as a direct source).

## Captured outcome (from `p81_32690_check2.json`)

| Field | Value |
|------|-------|
| `trace.finalOutcome` | `remediated_pass` |
| `publishSafe` | `true` |
| `winningRecipeId` | `inset_white_catalog_png` |
| `winningRemediationCandidateUrl` | `https://ae01.alicdn.com/kf/Sd8adf1f1f796411e96d94f9f8c6d45440.jpg` |

## Remediation source selection order (explicit fitness)

The remediation loop tried the highest `remediationFitness` candidate first:

1. Candidate `s2eee0bfe21604c31b468ed75b002ecdc8` (`remFit=85.33`)
   - Reasons (trace): `remFit_text_logo_risk_100`, `remFit_background_simplicity_74`, `remFit_pred_trim_area_1.000_extent_1.000`
   - Both remediation recipes failed to be gate-pass publishable:
     - `square_white_catalog_jpeg`
       - `policyPass=false` (`output_edge_texture_high_55.1`)
       - `heroPass=false` (`hero_subject_area_ratio_0.409_below_0.42`)
       - `integrityPass=true`
     - `inset_white_catalog_png`
       - `policyPass=false` (`output_edge_texture_high_51.2`)
       - `heroPass=false` (`hero_subject_area_ratio_0.316_below_0.42`, `hero_subject_width_ratio_0.3672_below_0.42`)
       - `integrityPass=true`

2. Candidate `sd8adf1f1f796411e96d94f9f8c6d45440` (`remFit=83.01`)
   - `inset_white_catalog_png` succeeded fully (gate-pass):
     - `policyPass=true`, `conversionPass=true`, `heroPass=true`, `integrityPass=true`
   - Key “strong output” metrics recorded in trace:
     - `heroMetrics.subjectAreaRatio=0.7039`, `heroMetrics.extentBalance=0.959`
     - `integrityMetrics.signalPixelRatio=0.44856`, `integrityMetrics.luminanceRange=236`, `integrityMetrics.nearWhitePixelRatio=0.54546`

## Comparison vs prior behavior

- Previously remediation ordering used `remediationPotential`.
- With P81, ordering uses `remediationFitness` and is traceable per candidate (`remediationFitnessReasons`) plus the chosen winning base (`winningRemediationCandidateUrl`).

On this forced remediation run, the top-to-fix candidate could not produce a policy-valid portada, so the pipeline correctly moved to the next viable candidate by fitness.

