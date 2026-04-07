# P95 — Next Blocker Isolation

## Product: 32714

## Blocker Priority Order

After resolving the mlChileFreight persistence blocker, the publish-preflight reveals **3 remaining blockers** in priority order:

### 1. `mercadolibre_test_connection_failed` (HIGHEST LEVERAGE)

**Priority**: P0 — all other checks depend on a working ML connection

**Exact issue**: `publisher.testConnection()` returns `false`. This means the MercadoLibre OAuth token is expired or the API is not reachable.

**Fix**: Refresh MercadoLibre OAuth token via the admin UI or re-authenticate via the OAuth flow.

### 2. `images:ml_canonical_dual_gate_failed_all_candidates_and_remediations`

**Priority**: P1 — no compliant images exist for ML Chile publication

**Exact issue**: The image remediation pipeline (`runMercadoLibreImageRemediationPipeline`) could not produce a publishable asset pack. `imageCount: 0` in the final pack.

**Root cause**: The product images from AliExpress likely fail ML Chile's image policy (watermarks, text overlays, non-white backgrounds, etc.) and no successful remediation was possible.

**Fix**: Either:
- Upload manually curated images that pass ML Chile policy
- Fix the image remediation pipeline to handle this product's specific image issues
- Use a different product image source

### 3. `pricing:real profit -2.07 must be > 0 (sale 7.02 vs total cost 9.09)`

**Priority**: P1 — the listing is economically unviable at current price

**Exact issue**: The suggested price ($7.02) does not cover the fully-loaded cost ($9.09 = $3.19 supplier + $3.12 shipping + $1.20 tax + ~$1.58 ML fees).

**Fix**: Increase listing price to at least $10.00 to achieve minimum viable margin.

## Next Highest-Leverage Move

**Refresh MercadoLibre OAuth token** — this is the single highest-leverage action because:
1. It unblocks `testConnection`
2. It allows the economics core to run during preflight (currently short-circuited by `!statusOk` in line 195)
3. It enables accurate image validation through ML API
