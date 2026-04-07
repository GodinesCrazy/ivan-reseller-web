# P82 — Current limitation analysis (why P81 heuristics are not enough)

## What P81 fixed

P81 introduced `remediationFitness` and deterministic `remediationFitnessReasons`, then ordered remediation attempts by that score. That is strictly better than using only `remediationPotential`.

## Why heuristics still mislead

`remediationFitness` is built from:

- edge-strip texture / brightness proxies
- a **trim-based predictor** that mirrors P79 hero thresholds on the **source** image

Those signals can diverge from the **actual** post-remediation cover because:

1. **Recipes reshape geometry** (square contain, inset crop, neutral crush). A source that “looks trim-full-canvas” may still produce a good inset portada, or the opposite.
2. **Edge texture on the remediated output** is not the same as edge texture on the supplier JPEG; the policy output gate is applied to the **recipe output**, not the source.
3. **Hero metrics on the source** do not equal hero metrics on the **remediated** buffer; the winning recipe may be `inset_white_catalog_png`, which changes subject dominance materially.

## Real SKU evidence (32690)

Under P81 ordering, `s2eee0…` often ranked first by `remediationFitness` even when preview-quality remediation outputs were weaker than another supplier image for the same product set.

## Value of low-cost simulation before final remediation

Running a **scaled preview** of the same recipes on a downsampled input, then evaluating **hero + integrity + simulation-grade policy/conversion** on the preview output:

- aligns selection with **what the gates actually measure** on recipe outputs
- preserves fail-closed behavior on the **final** full-resolution pass
- adds traceable “why this candidate won/lost” without weakening production thresholds
