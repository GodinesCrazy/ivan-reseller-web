# P78 — Better asset pack strategy (32690)

## Constraints

- **No gate weakening** — thresholds unchanged.
- **No stale-pack bypass** — canonical must pass on its own merits.
- **Honest observation:** The canonical pipeline only scored **HTTP(S) AliExpress-shaped URLs** before P78; the **on-disk approved pack** was invisible to canonical.

## Strategy chosen

1. **P78 integration (minimal wiring)**  
   - **`mlImagePipeline.canonicalEvaluateLocalApprovedCover: true`** — score the existing approved `cover_main` as a first-class candidate (same scoring + dual gates).  
   - **`enumerateMainCandidates`** — include URLs **without** `/kf/S...` keys (e.g. CDN supplements) instead of dropping them.  
   - **`mergeCanonicalSupplementUrls`** — optional prepend of operator HTTPS URLs from `productData`.

2. **Enable second recipe for this SKU**  
   - Set **`mlImagePipeline.insetCrop`** to the same fractions as the remediation default inset (`left/top/bottom/right` as in `remediation-recipes.service.ts` `DEFAULT_INSET`) so **`inset_white_catalog_png`** runs after **`square_white_catalog_jpeg`**.

3. **Let canonical remediate**  
   - Local cover had highest **remediationPotential**; after enabling inset, **`inset_white_catalog_png`** on the local buffer produced an output that **passed both output gates** → **`remediated_pass`**.

## What we did not do

- Did not lower `minPolicyFitness` / `minConversionFitness`.  
- Did not force publish using the pre-canonical “hybrid visual only” path.  
- Did not replace supplier listing with fake URLs only (suppliers remain in gallery order after remediated pack write).
