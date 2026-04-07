# P109 — P108 limit analysis (what alpha-only recovery could not fix)

## Reference

- P108 benchmark and verdict: [P108_PRODUCT_32714_ADVANCED_BENCHMARK.md](./P108_PRODUCT_32714_ADVANCED_BENCHMARK.md), [P108_FINAL_VERDICT.md](./P108_FINAL_VERDICT.md).

## P108 coverage

P108 added **multi-wave alpha recovery** (feather, dilate combinations) **before** the existing P107 multi-recipe compose grid. Ranking, isolation, and fail-closed classification behaved as designed; **no supplier-only candidate cleared the full strict gate stack** for product **32714**.

## Failure clusters still dominant after P108

Aggregated strict-natural signals from the P108/P109 runs point to the same structural limits:

| Cluster | Typical gate signals | Segmentation-only fix? | Needs background / stronger reconstruction? |
|--------|----------------------|------------------------|---------------------------------------------|
| Harsh silhouette / cutout vs white field | `harsh_silhouette`, sticker/cutout risk | Partially (softer alpha, mask spread) | Often yes — fringe color and “pasted” look persist |
| Insufficient white dominance | `near_white_dominance`, `true_white_pixels` | Partially (cleaner mask reduces gray bleed) | Often yes — supplier gray panels and residual non-white fill |
| Border non-uniformity | `border_non_uniform`, `corner_not_white_enough` | Partially | Yes when composition leaves uneven margins after trim |
| Object bleed / shadow at border | `border_shadow_or_object_bleed` | Partially (tighter mask vs looser) | Yes when shadow is baked into supplier art |
| Fragmentation / collage | `high_local_contrast_fragmentation`, sticker/collage | Partially (single CC isolation) | Yes when frame is intrinsically multi-panel |
| Seam / split-layout | `vertical_split_seam_collage_risk` | Unlikely | Yes — layout is in the RGB, not only alpha |

## Conclusion for P109

**Alpha-only post-processing** cannot reliably remove **layout-level** collage/seam structure or replace **non-white studio fields** with a compliant catalog white. P109 therefore adds:

1. **Segmentation variants** (border stats, threshold, CC dilate, alpha blur) to probe mask quality without manual heroes.
2. **Controlled RGB “studio prep”** on the cutout fringe (local pull toward white — **not** a generative inpainting API) to test whether halo suppression moves white-field and natural-look gates.

If these still fail, the honest classification is **autonomous limit** (gates + source geometry), not “missing alpha tuning.”
