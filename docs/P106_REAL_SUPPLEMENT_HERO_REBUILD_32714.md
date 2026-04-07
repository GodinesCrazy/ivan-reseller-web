# P106 — Real supplement hero rebuild (32714)

## Pipeline

Same as P105/P103 when supplement hero is configured:

1. Persist metadata (unless `--dry-run`).
2. **`attemptMercadoLibreP103HeroPortadaFromUrls`** with **`workspaceRoot`** resolved from the canonical pack dir.
3. **Fail-closed:** no **supplier** trials when supplement hero is configured (see P105 trace fields).
4. On success: write **`artifacts/ml-image-packs/product-32714/cover_main.png`**, set manifest **`assetSource: p106_real_supplement_hero`**, record **`coverMainSha256`** in **`p106-live-result.json`**.

## This run

**Not executed.** No hero input was provided; the script stopped at **`p106_real_supplement_hero_missing`** before load, persist, or rebuild.

## Gate reporting on failure

On rebuild failure, **`p106-live-result.json`** includes **`p103Trace`**, **`fatalError`** (e.g. `portada_supplement_hero_exhausted_no_supplier_fallback`), and **`gateResultsSummary`** (last trial snapshot when present).
