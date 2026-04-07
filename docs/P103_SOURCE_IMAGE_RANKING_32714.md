# P103 — Source image ranking (product 32714)

## Method

All HTTP supplier URLs on product **32714** are deduplicated with the same rules as the canonical pipeline (`enumerateMainCandidates` / AliExpress `kf` object keys). Each downloaded image is scored with **`scoreImageCandidateFromBuffer`** (policy + conversion + **remediationFitness** with trim-based hero predictors).

## Ranking order (highest leverage first)

1. **remediationFitness** (descending) — expected ease of producing a strong portada after cleanup.
2. **textLogoRisk** (ascending) — prefer lower promo/text edge energy.
3. **backgroundSimplicity** (descending) — prefer calmer borders.
4. **combinedScore** (descending) — tie-break.

## Implementation

- `backend/src/services/ml-portada-source-ranking.service.ts` — `rankPortadaSourceBuffersForP103`, `listMercadoLibrePortadaSourceCandidates`.
- `backend/src/services/ml-portada-hero-reconstruction.service.ts` — consumes ranked rows in order (default **8** trials).

## Product 32714 — operator evidence

Run `npx tsx scripts/p103-hero-rebuild-32714.ts` (from `backend/`). The JSON result at repo root **`p103-rebuild-result.json`** includes:

- `p103Trace.rankedSources` — full ranked table (scores + `reasons` from remediation fitness).
- `winningUrl` / `winningObjectKey` — only when a candidate passes isolation + all gates.

**Note:** This environment did not execute the script against live DB/API; ranked rows for the real SKU must be taken from that file after you run it.
