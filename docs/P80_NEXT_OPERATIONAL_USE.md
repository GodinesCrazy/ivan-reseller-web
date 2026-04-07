# P80 — Next operational use

## SKU 32690

- If the **only** available “cover” is the **on-disk** near-blank `artifacts/ml-image-packs/product-32690/cover_main.*`, canonical remediation will **not** accept remediated outputs from it: integrity **hard-fails** with explicit trace strings.
- Operators should **replace** that asset with a real subject-bearing cover **or** rely on supplier candidates that survive policy + conversion + hero + **integrity** (as in the 2026-03-25 run, where `inset_white_catalog_png` on another candidate won).
- Do not set `ML_OUTPUT_INTEGRITY_GATE=0` except short break-glass; it re-opens the near-blank publish class.

## Future ML publications

- Any product using **`runMlChileCanonicalPipeline`** with default env inherits **integrity** on both direct and remediated paths.
- Traces in `productData.mlChileCanonicalPipeline.trace` include `integrityPass` / `integrityFailures` / `integrityMetrics` for auditing.

## When human review is required

- If **all** candidates and **all** remediation attempts exhaust with at least one of policy, conversion, hero, or **integrity** failing, outcome remains `human_review_required` with enriched reasons including `integrity_gate:…` lines.
