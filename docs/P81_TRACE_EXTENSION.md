# P81 — Trace extension (remediation fitness + chosen source)

## Candidate trace

Candidate-level trace now includes P81 remediation fitness:

- `backend/src/services/marketplace-image-pipeline/types.ts`
  - `ImageCandidateScoreBreakdown.remediationFitness: number`
  - `ScoredImageCandidate.remediationFitnessReasons: string[]`
  - `CanonicalRankedCandidateDetail.remediationFitnessReasons: string[]`

So in `mlChileCanonicalPipeline.trace`:

- `trace.rankedCandidateDetails[*].scores.remediationFitness`
- `trace.rankedCandidateDetails[*].remediationFitnessReasons`

are available for operator review.

## Remediation ordering trace steps

During the remediation loop, the pipeline now pushes human-readable ordering steps:

- `remediation_candidate_try:{objectKey}:remFit={score}:{reason1}|{reason2}|{reason3}`
- `skip_remediation_candidate_no_buffer:{objectKey}:remFit={score}`

These steps show:

- which candidate was considered best-to-fix first
- what deterministic reasons drove the score
- why a candidate was skipped (if no buffer could be loaded)

## Terminal chosen source

When remediation succeeds and the pipeline returns `pack_buffers`, trace records the chosen base:

- `trace.winningRemediationCandidateUrl`

and the check script surfaces it in `p77Summary.winningRemediationCandidateUrl`.

