# P76 — Candidate scoring model

## Purpose

Every **main** candidate image is scored for **policy fitness**, **conversion fitness**, and **combined** ranking, plus **remediation potential** to prefer promising sources before applying heavy recipes.

## Implementation

- **File**: `backend/src/services/marketplace-image-pipeline/candidate-scoring.service.ts`
- **Enumeration**: `enumerateMainCandidates` — builds candidates from product image URLs (excludes detail-only keys consistent with prior ML image work).
- **Download + metrics**: Sharp-based heuristics on edges, centering, occupancy proxies.
- **Output**: `ScoredImageCandidate` with:
  - **`scores`**: `textLogoRisk`, `backgroundSimplicity`, `centeringBalance`, `productOccupancy`, `clutterPackagingRisk`, `catalogLook`, `conversionAttractiveness`, `remediationPotential` (each 0–100 where applicable).
  - **`policyFitness`**, **`conversionFitness`**, **`combinedScore`**.

## Thresholds vs gates

- **Scoring** informs **ranking** and **remediation order** (`remediationPotential` sort in `ml-chile-canonical-pipeline.service.ts`).
- **Pass/fail** for publish is **not** a single score cutoff alone: it is **`evaluateDualGatesOnCandidate`** / **`evaluateDualGatesOnOutputBuffer`** using profile `dualGate` minima (`dual-gate.service.ts`).

## Limitations (honest)

- Heuristic / CV-lite signals — **not OCR** for text detection; high-risk SKUs may still need human review.
