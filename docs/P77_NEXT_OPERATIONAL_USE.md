# P77 — Next operational use

## Current listing problem (e.g. product 32690)

1. Run **`npx tsx scripts/check-ml-image-remediation.ts <productId>`** (add `--persist` to write remediation metadata back to `productData`).
2. Read **`p77Summary`** and **`remediation.mlChileCanonicalPipeline.trace`**:
   - If **`finalOutcome: human_review_required`**: inspect **`directPathGateEvaluations`** and **`remediationAttempts`** for concrete failures (policy vs conversion).
3. **Do not** assume an old **`cover_main.png`** in `artifacts/ml-image-packs/` is publishable: canonical failure **blocks** `publishSafe` until the pipeline passes or you use an explicit **stale-pack override** under `reject_hard` only (rare).

## Improving odds without lowering gates

- Add **`mlImagePipeline.insetCrop`** if inset recipe should run.
- Replace or supplement supplier images (less text/logo clutter) so **`text_logo_risk`** and policy fitness improve.
- Regenerate internal asset pack through the existing executor / visual approval flow, then re-run the script.

## Future products

Every ML Chile publish path that uses **`runMercadoLibreImageRemediationPipeline`** gets the **same** canonical + P77 behavior by default.

## Manual review queue

**Yes**, it remains necessary when:

- Canonical exhausts direct + remediation (`human_review_required`), or  
- Legacy audit still requires manual review with canonical disabled or not applied.

The queue is **honest**: **`publishSafe: false`** and **`integrationLayerOutcome`** explain why.
