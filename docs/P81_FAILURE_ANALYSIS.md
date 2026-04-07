# P81 — Failure analysis (bad remediation base image)

## Current observed weakness

After P76/P77/P78/P79/P80, the canonical pipeline is still able to:

- choose a source image for remediation that is technically “fixable”
- but not the easiest-to-fix source
- which can produce a commercially weak portada even when the output passes the strict Policy + Conversion + Hero + Integrity gates

In other words: “gate-pass” is not the same as “best-to-publish attractiveness.”

## Where the pipeline previously fell short

Before P81, remediation candidate ordering was effectively driven by a proxy (`remediationPotential`) computed from source-image edge/texture statistics.

That proxy did not explicitly model the *ease-of-fix* factors that determine whether a given source image will turn into a strong portada (subject separation clarity, crop survivability, and expected hero strength).

## Dimensions: policy risk vs conversion fitness vs remediation fitness

- **Policy risk**: probability the *remediated output* fails strict marketplace output constraints (dimensions, aspect ratio, edge texture/brightness requirements).
  - This is enforced by `evaluateDualGatesOnOutputBuffer` on the remediation output.

- **Conversion fitness**: probability the *image looks commercially attractive* enough to sell.
  - This is enforced by `evaluateDualGatesOnCandidate` / `evaluateDualGatesOnOutputBuffer` using `textLogoRisk`, `catalogLook`, `productOccupancy`, etc.

- **Remediation fitness (new in P81)**: expected *ease of converting the candidate source* into a strong portada with high subject clarity and crop survivability.
  - This is what P81 makes explicit and traceable during candidate ordering *before* committing to remediation.

## Why it matters

When multiple candidates could produce a gate-pass output, the canonical pipeline will stop at the first success (first passing remediation attempt).

If that first passing attempt is built on a “hard base image” (background cleanup is messy; subject separation is unreliable; crop composition tends to be thin or awkward), the final cover can still be objectively weaker than the cover produced from a different source.

P81 fixes this by ranking candidates with a dedicated remediation-fitness / ease-of-fix model and exposing the reasoning in traces.

