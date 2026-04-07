# P79 — Scoring and trace extension

## Trace fields

Each **`CanonicalCandidateGateRecord`** now includes:

- **`heroPass`**: boolean  
- **`heroFailures`**: string[]  
- **`heroMetrics`**: `CanonicalHeroMetricsSnapshot`  
  - `subjectAreaRatio`  
  - `subjectWidthRatio`  
  - `subjectHeightRatio`  
  - `extentBalance`  
  - `trimThreshold`  

Each **`CanonicalRemediationAttemptDetail`** includes the same hero trio.

## Candidate score breakdown

The existing **`ImageCandidateScoreBreakdown`** (P76) is **unchanged**; hero metrics are **orthogonal** and stored on the **trace** to avoid conflating heuristic scores with trim-based composition.

## Debugging

Operators read **`mlChileCanonicalPipeline.trace.directPathGateEvaluations`** and **`.remediationAttempts`** to see **exact** hero failures next to policy/conversion failures.
