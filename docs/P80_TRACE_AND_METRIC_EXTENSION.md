# P80 — Trace and metric extension

## Trace fields

On each `CanonicalCandidateGateRecord` (direct path) and `CanonicalRemediationAttemptDetail` (remediation):

| Field | Meaning |
|-------|---------|
| `integrityPass` | Boolean pass for P80 gate |
| `integrityFailures` | Copy of failure strings (debuggable, stable prefixes) |
| `integrityMetrics` | Snapshot: `meanLuminance`, `luminanceStdev`, `signalPixelRatio`, `nearWhitePixelRatio`, `luminanceRange`, `sampleWidth`, `sampleHeight` |

## Steps string

- Direct: `dual_gate_direct:…:hero=:integrity=`.
- Remediation: `remediation:…:hero=:integrity=`.

## Human-review reasons

On terminal `human_review_required`, recent attempts append:

- `last_try:…:integrity=…`
- `integrity_gate:{recipeId}:{failure}` (from last attempts’ `integrityFailures`)

## Metadata

Existing `mlChileCanonicalPipeline.trace` JSON persists full structure for operators and scripts (e.g. `check-ml-image-remediation.ts`).
