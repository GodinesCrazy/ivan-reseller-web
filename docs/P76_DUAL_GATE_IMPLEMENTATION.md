# P76 — Dual gate implementation

## Gates

1. **Policy Gate** — proxies aligned with main-slot policy (dimensions, aspect, edge texture, luminance, background simplicity).
2. **Conversion Gate** — proxies for **commercial quality** (centering, occupancy, catalog look, clutter, attractiveness) so a cover cannot be approved on policy alone if it is clearly weak.

## Structures

- **Types**: `GateResult`, `DualGateEvaluation` in `marketplace-image-pipeline/types.ts`.
- **Evaluation**:
  - **On candidate**: `evaluateDualGatesOnCandidate(scored, profile)` — `dual-gate.service.ts`
  - **On buffer** (post-remediation): `evaluateDualGatesOnOutputBuffer(buffer, profile)`

## Pass rule

- **`bothPass === true`** requires **policy.pass && conversion.pass**.
- Failures accumulate human-readable **`failures[]`** per gate for traceability.

## Publish rule

- **No cover is publishable through the canonical path** unless **both gates pass** (either on raw ordered URLs or on remediated buffer written to pack).
- Remediation integration sets **`publishSafe`** from the pipeline outcome; **`human_review_required`** forces **`publishSafe: false`** even if an **old** on-disk pack exists (`canonicalHandled.kind === 'human_review'` guard on `assetPack.packApproved`).

## Thresholds

- Profile: `ML_CHILE_POLICY_PROFILE_V1.dualGate` in `policy-profiles.ts` (`minPolicyFitness`, `minConversionFitness`).
