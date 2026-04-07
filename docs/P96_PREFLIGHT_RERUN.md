# P96 — Preflight rerun (product 32714)

## Status: DONE

### Command

From repo root (after integration):

`cd backend && npx tsx scripts/p95-preflight-check.ts`

Artifact: `p95-preflight.json` at repository root (latest run captured during P96).

### Snapshot: `p95-preflight.json` (representative post-fix)

- **`overallState`:** `blocked_marketplace_connection`
- **`publishAllowed`:** `false`
- **`blockers`:**  
  - `mercadolibre_test_connection_failed`  
  - `images:ml_canonical_dual_gate_failed_all_candidates_and_remediations`  
  - *(**Note:** `pricing:*` blocker **absent** once DB `finalPrice` reflects uplift, e.g. listing **12 USD**.)*
- **`nextAction`:** Refresh Mercado Libre token / fix API credentials (per `MercadoLibrePublisher.testConnection()` path used in preflight).
- **`listingSalePriceUsd` (preflight):** **12** — matches persisted `finalPrice` after canonical uplift.
- **`mercadoLibreApi.testConnectionOk`:** `false` in this rerun (see verdict: environment may differ from `docs/P96_ML_TOKEN_REFRESH_CONNECTION_RECOVERY.md`).

### Diagnostic first block in `p95-preflight-check.ts`

The script still runs an initial `runPreventiveEconomicsCore` at the **historical** snapshot price (**7.02**) for comparison; that block correctly shows:

`real profit -2.07 must be > 0 (sale 7.02 vs total cost 9.09)`.

That is **expected** until the script is refetched after persistence or until it is updated to use post-persist `getEffectiveListingPrice`. **Ground truth for pricing is the preflight pass at persisted DB price.**
