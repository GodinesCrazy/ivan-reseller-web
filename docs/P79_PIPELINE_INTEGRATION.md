# P79 — Pipeline integration

## Files

| File | Role |
|------|------|
| `hero-cover-quality-gate.service.ts` | `evaluateHeroCoverQualityOnBuffer(buf, profile)` |
| `policy-profiles.ts` | `heroCoverGate` thresholds + `isHeroCoverGateEnabled()` |
| `types.ts` | `HeroCoverGateThresholds`, `CanonicalHeroMetricsSnapshot`, extended gate records |
| `ml-chile-canonical-pipeline.service.ts` | Wiring |

## Direct path (raw candidate)

For each ranked candidate:

1. `evaluateDualGatesOnCandidate` (unchanged).  
2. Load buffer (`loadBufferForScoredCandidate`).  
3. `evaluateHeroCoverQualityOnBuffer`.  
4. Append **`directPathGateEvaluations`** row with **`heroPass`**, **`heroFailures`**, **`heroMetrics`**.  
5. **`raw_ordered`** only if **`gates.bothPass && heroResolved.pass`**.

## Remediation path

For each recipe output:

1. `evaluateDualGatesOnOutputBuffer` (unchanged).  
2. `evaluateHeroCoverQualityOnBuffer(out)`.  
3. Append remediation row with hero fields.  
4. **`pack_buffers`** only if **`og.bothPass && heroOut.pass`**.

## Publish safety

If hero fails, the canonical branch does not return `raw_ordered` / `pack_buffers` for that attempt; pipeline continues or ends in **`human_review_required`**. **`runMercadoLibreImageRemediationPipeline`** unchanged in structure — still driven by canonical outcomes.

## Trace steps

Examples:

- `dual_gate_direct:{key}:policy=…:conv=…:hero=…`  
- `remediation:{recipe}:…:policy=…:conv=…:hero=…`

Human-review **`reasons`** append `hero_gate:{recipe}:{failure}` for the last attempts when useful.
