# Opportunity import — production runtime analysis

## Live backend snapshot (verified externally)

As of this audit, `GET https://ivan-reseller-backend-production.up.railway.app/version` returned:

- `gitSha`: `eb2e8cd`
- `env`: `production`

That commit includes the **first** import-truth pass (metadata root + Affiliate enrichment + operational-truth shipping ≥ 0), but **not** the follow-up hardening in this repository session:

- Dropshipping API fallback when Affiliate keys are missing
- Broader AliExpress item-id extraction from URLs
- **`POST /api/products`**: skip workflow **auto-approve** when opportunity enrichment returns `ok: false` (prevents `LEGACY_UNVERIFIED` from reconcile on incomplete imports)
- Correct `updateProductStatusSafely(product.id, 'APPROVED', false)` (previous code passed `userId` as the third parameter, which the service interpreted as **adminId**, not `isPublished` — status still changed, but logging/semantics were wrong)
- `GET /api/version` alias (same payload as `/version`) for SPA same-origin checks

## Why rows still showed LEGACY / missingSku / missing shipping

1. **Affiliate-only path in `eb2e8cd`**: Many sellers configure **AliExpress Dropshipping** OAuth but not **Affiliate Portal** app key/secret. Enrichment then exits with `affiliate_api_not_configured` → no `aliexpressSku` / shipping → with **analyze automatic**, reconcile still downgraded to `LEGACY_UNVERIFIED`.

2. **Promotion / non-canonical URLs**: Item id not parsed by the narrow `/item/(id)` adapter-only path → `missing_aliexpress_item_id`.

3. **Auto-approve on incomplete enrichment**: Even when enrichment failed, automatic approval to `APPROVED` triggered `reconcileProductTruth` → `LEGACY_UNVERIFIED` if machine context was still incomplete.

## Conclusion

Production behavior at `eb2e8cd` is **consistent with code shipped in that revision**. Remaining degradation is explained by credential coverage + URL parsing + auto-approve semantics, addressed in the subsequent code changes bundled with this audit.
