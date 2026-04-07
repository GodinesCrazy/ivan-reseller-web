# P67 — Fallback if second image cannot be recovered

## Irreducible blocker (this sprint, evidenced)

**Both** of the following failed for product `32690` in the executed environment:

1. **AliExpress Dropshipping** — no **`accessToken`** resolved for the product owner via DB (user + global) or env merge.
2. **AliExpress Affiliate** — **`affiliate_not_configured`** (no app key/secret in env; no usable DB credential for the affiliate client).

Until one lane is configured, **no additional supplier URLs** can be merged by `p66-enrich-product-images.ts`.

## Next moves (ordered by leverage)

1. **Credential recovery (minimum):** Fix Dropshipping **or** Affiliate per `docs/P67_ALIEXPRESS_CREDENTIAL_RECOVERY_FOR_IMAGE_ENRICHMENT.md`, then rerun enrichment. This is the only automated way to prefer **real** multi-angle supplier art.
2. **Manual seller-side replacement:** Operator uploads two **distinct** catalog-safe images directly in Mercado Libre (bypasses DB enrichment but satisfies seller review if ML accepts sources).
3. **Mercado Libre seller support:** If ML flags policy without a clear technical fix, escalate with verbatim reason text from `P67_SELLER_REASON_CAPTURE_PATH.md`.
4. **Alternate product substitution:** **Out of scope** for P67 (listing-scoped only); do not start a second product cycle here.
5. **Controlled one-photo + derivative detail:** Only if operator + ML accept it; P66 already used **`single_supplier_url_cover_plus_distinct_zoom_detail`** — treat as **last resort**, not “safe by default,” for photo-review risk.

## Explicit honesty

P67 did **not** prove that a second **distinct** supplier raster exists on AliExpress for this item until an API returns multiple norm-distinct URLs. Credential repair is the gating step.
