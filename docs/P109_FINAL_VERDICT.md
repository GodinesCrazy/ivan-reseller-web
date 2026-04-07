# P109 — Final verdict

## Product 32714 — automatic compliance

**Verdict: `PRODUCT_32714_AUTONOMOUS_V2_LIMIT_REACHED`**

After adding **P109 autonomous V2** (multiple segmentation variants, controlled RGB fringe studio prep, then P108 alpha waves and P107 multi-recipe compose), the **2026-03-27** benchmark (`p109-benchmark-32714.json`, fast matrix) still ends with:

- `p103Ok`: **false**
- `automaticPortadaClassification`: **`AUTONOMOUS_V2_RECOVERY_EXHAUSTED`**
- No `winningUrl`, no `coverSha256`

So **stronger segmentation + local studio prep** moved the **engine** forward (traceability, engine version, expanded search), but **did not** produce a gate-passing automatic portada for **32714** on supplier-only inputs.

## Live apply

**Honest no-apply:** with no passing candidate, the pipeline must **not** force-publish a portada. No ML listing-image apply was performed for a winning cover in this benchmark.

## Honest limit classification

This is best classified as **deeper autonomous limit under current gates**: dominant signals remain **harsh silhouette / sticker**, **white-field dominance**, **fragmentation/collage**, and **vertical split seam** — patterns that **alpha and fringe RGB alone** do not reliably erase. It is **not** framed as “ranking broken” or “multi-recipe broken”; those paths work.

## Next engineering lever (single)

Introduce **true controlled background reconstruction** (e.g. inpainting/outpainting) **behind the same strict gates**, or **require cleaner hero acquisition** for SKUs with persistent collage/seam geometry — see [P109_P108_LIMIT_ANALYSIS.md](./P109_P108_LIMIT_ANALYSIS.md).
