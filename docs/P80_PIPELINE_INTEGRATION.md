# P80 — Pipeline integration

## Where it runs

`runMlChileCanonicalPipeline` (`ml-chile-canonical-pipeline.service.ts`):

1. **Direct path:** After dual-gate + hero on each candidate buffer, **`evaluateOutputIntegrityOnBuffer`** runs on the **same** buffer. Terminal `raw_ordered` requires `policy ∧ conversion ∧ hero ∧ integrity`.
2. **Remediation path:** After `evaluateDualGatesOnOutputBuffer` + `evaluateHeroCoverQualityOnBuffer` on the recipe output, **`evaluateOutputIntegrityOnBuffer`** runs on that output (with `heroMetrics` from the hero pass). Terminal `pack_buffers` / `remediated_pass` requires all four.

## Publish safety

For canonical ML Chile outcomes:

- **`publishSafe: true`** via `canonical_pipeline_v1` only when the pipeline returns `raw_ordered` or `pack_buffers`, both of which now require integrity to pass. No separate weakening of earlier gates.

## Direct vs remediation

- **Minimum (per sprint):** remediation outputs — **done**.
- **Also applied:** direct candidate buffers — **done** (same bar as publish-facing cover).

## Recipes

No changes to `square_white_catalog_jpeg` / `inset_white_catalog_png` logic; the gate judges **their outputs** only.
