# P78 — Decision after re-evaluation

## Actual outcome: **`remediated_pass`**

### Meaning

Canonical ML Chile pipeline **accepted** a **remediated** cover (inset + white catalog PNG) derived from the **local approved** source, plus a **square JPEG** detail from a supplier image. **Publish is allowed** (`publishSafe: true`) without weakening gates.

### Next move

1. **Proceed to MercadoLibre publish** (staging/real per your flags) using existing `resolveMercadoLibrePublishImageInputs` — images resolve to **local paths** from the pack where applicable.  
2. **Optional:** Run `check-ml-image-remediation.ts 32690 --persist` to store latest `mlChileCanonicalPipeline` / compliance blobs on `productData`.  
3. **Monitor** first listing moderation; if ML rejects for a reason outside our heuristics, capture screenshot and adjust **assets**, not gates.

## If outcome had stayed `human_review_required`

Next moves would have been: stronger **source** image (regenerate self-hosted hero), tune **insetCrop** fractions per SKU, or add **`canonicalSupplementUrls`** with a hosted clean hero — still without lowering `dualGate` thresholds.

## If outcome had been `direct_pass`

Use **`orderedUrls`** as-is (first path = local file or remote per trace).

## If outcome had been `reject_hard`

Fix missing images or explicit override per P77 — not applicable here.
