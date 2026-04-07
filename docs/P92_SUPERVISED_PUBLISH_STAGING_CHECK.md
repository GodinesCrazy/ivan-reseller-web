# P92 — Supervised publish staging check

## Rule

Publish only if `publishAllowed === true` from preflight; do not bypass fail-closed rules.

## This sprint

**NOT EXECUTED.**

Reason chain:

1. DS credentials missing → no product row.  
2. No preflight green → no supervised `POST /api/marketplace/publish` / Intelligent Publisher approve for this candidate.

## Evidence

No `listingId`, no ML API response payload.

## Exact next action

After preflight shows `ready_to_publish`, run supervised publish with the same `environment` as ML credentials; record `listingId` and permalink in a new artifact (e.g. `artifacts/p92/p92-publish-result.json`).
