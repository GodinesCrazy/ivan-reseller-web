# CJ — Phase C implementation report (selective deep freight, economic contract)

## 1. Executive summary

Phase C adds **selective CJ `freightCalculate`** for opportunity discovery: only the first **N** CJ rows (in Phase B rank order) receive a deep shipping quote. Others keep **listing unit price + default commerce shipping** from Phase B. Results are normalized in **`supplyMeta`**, **`OpportunityItem.economicSupplyQuote`**, and pipeline diagnostics **`deepQuote`**, with **in-process TTL cache**, **inter-call spacing**, and **429-aware degradation** (keep estimated shipping, mark failure).

**Result: GO** for code delivery. **Real CJ calls** depend on local `CJ_API_KEY` / credentials for user `1` (or `CJ_SMOKE_USER_ID`); see §8.

---

## 2. Prior state (Phase B)

- Unified `SupplyQuoteService` + CJ list discovery with default `defaultChinaUsShippingUsd` on CJ rows.
- `quoteShippingToUsReal` / `freightCalculate` existed in `CjSupplierAdapter` but were **not** used in the opportunity pipeline.
- No per-row lifecycle for `shippingEstimateStatus` / deep quote / cache.

---

## 3. What was implemented

| Area | Detail |
|------|--------|
| **Selective deep quote** | `applySelectiveCjDeepFreightQuotes` in `cj-opportunity-deep-quote.service.ts` mutates CJ rows in place: `shippingCost`, optional delivery days, `supplyMeta`. |
| **Cache** | In-memory `Map`, key `productId|qty|zip`, TTL `OPPORTUNITY_CJ_FREIGHT_CACHE_TTL_MS` (default 30m). `__resetCjFreightQuoteCacheForTests()` for Jest. |
| **QPS / spacing** | `OPPORTUNITY_CJ_DEEP_QUOTE_MIN_SPACING_MS` between freight calls; adapter retains global **~1.1s** throttle on authed calls. |
| **Multi-variant** | If `productId` resolves to **multiple** variants, CJ requires explicit `vid` — row is **skipped**, `deepQuoteFailureReason: multi_variant_requires_explicit_vid`, no mass `getProductById` for every list row. |
| **Types** | `SupplyRowMeta` extended (Phase C fields + `cjFreightMethod`). `SupplyDiscoveryDiagnostics.deepQuote`. `OpportunityEconomicSupplyQuote` + `OpportunityItem.economicSupplyQuote`. |
| **Finder integration** | After `supplyQuoteService.discoverForOpportunities`, if any `supplierSource === 'cj'`, run deep quote and merge `deepQuote` into `supplyPipelineDiagnostics`. |
| **Frontend** | Optional `economicSupplyQuote` on `Opportunities.tsx` `OpportunityItem` (no UI change). |
| **Smoke script** | `npm run cj-api:deep-quote-smoke` — listV2 + freight until one success or list exhausted. |

### Cost semantics (explicit)

| Concept | Where | Notes |
|--------|--------|--------|
| **Listing unit** | `unitCostTruth: 'listing'`, `costSemantics.unitCostKind: 'listing_price'` | CJ list price. |
| **Shipping before deep** | `shippingSource: 'default_commerce_settings'`, `shippingEstimateStatus: 'estimated'` | User `defaultChinaUsShippingUsd`. |
| **Shipping after deep** | `shippingSource: 'cj_freight_calculate'`, `shippingEstimateStatus: 'deep_quoted'`, `shippingTruth: 'confirmed'` | API-backed **freight line** only; not full landed duties/taxes. |
| **Landed** | `landedCostTruth: 'estimated'`, `costSemantics.landedKind: 'landed_estimate'` | Unit (listing) + shipping line; still not “confirmed COGS”. |

---

## 4. Deep quote selection rules

1. Only rows with `supplierSource === 'cj'` and `supplyMeta.supplier === 'cj'` and `productId`.
2. **Order**: first such rows in the **post–Phase B array** (already ranked/deduped in `auto`).
3. **Cap**: `OPPORTUNITY_CJ_DEEP_QUOTE_MAX` (default **3**).
4. **Disabled** if `OPPORTUNITY_CJ_DEEP_QUOTE_ENABLED=false` or `OPPORTUNITY_CJ_SUPPLY_MODE=off`.

---

## 5. QPS / 429 / degradation

- **429**: `CjSupplierError` `CJ_RATE_LIMIT` increments `failed`, sets `rateLimited`, `degraded`, note `cj_rate_limit_during_deep_quote`; row keeps prior estimated shipping.
- **Other failures**: `failed++`, `degraded`, `deepQuoteFailureReason` on row meta; listing shipping unchanged unless already set.
- **Logs**: product id **length** only, no tokens (see `logger.info` / `warn` in deep-quote service).

---

## 6. New / changed env vars

| Variable | Default | Role |
|----------|---------|------|
| `OPPORTUNITY_CJ_DEEP_QUOTE_ENABLED` | `true` | Master switch. |
| `OPPORTUNITY_CJ_DEEP_QUOTE_MAX` | `3` | Max CJ deep quotes per search. |
| `OPPORTUNITY_CJ_DEEP_QUOTE_MIN_SPACING_MS` | `400` | Extra spacing between freight calls. |
| `OPPORTUNITY_CJ_FREIGHT_CACHE_TTL_MS` | `1800000` | In-process cache TTL. |
| `OPPORTUNITY_CJ_DEEP_QUOTE_DEST_ZIP` | (optional) | US `zip` on freight payload. |

Documented in `backend/.env.example`.

---

## 7. Files touched

**New**

- `backend/src/services/cj-deep-quote-meta.ts`
- `backend/src/services/cj-opportunity-deep-quote.service.ts`
- `backend/src/services/opportunity-economic-quote.mapper.ts`
- `backend/src/services/__tests__/cj-deep-quote-meta.test.ts`
- `backend/src/services/__tests__/opportunity-economic-quote.mapper.test.ts`
- `backend/scripts/cj-deep-quote-smoke.ts`
- `docs/CJ_PHASE_C_IMPLEMENTATION_REPORT.md`

**Modified**

- `backend/src/services/supply-quote.types.ts`
- `backend/src/services/supply-quote.service.ts` (initial Phase C meta for Affiliate/CJ)
- `backend/src/config/env.ts`
- `backend/src/services/opportunity-finder.types.ts`
- `backend/src/services/opportunity-finder.service.ts`
- `backend/package.json` (`cj-api:deep-quote-smoke`)
- `backend/.env.example`
- `frontend/src/pages/Opportunities.tsx`

---

## 8. Tests executed (evidence)

Commands (PowerShell-friendly):

```text
Set-Location c:\Ivan_Reseller_Web\backend; npm run type-check
Set-Location c:\Ivan_Reseller_Web\backend; npx jest src/services/__tests__/cj-deep-quote-meta.test.ts src/services/__tests__/opportunity-economic-quote.mapper.test.ts --no-cache
Set-Location c:\Ivan_Reseller_Web\backend; npm run cj-api:deep-quote-smoke
```

| Step | Expected |
|------|----------|
| `type-check` | Exit 0 |
| Jest (2 files) | Pass (meta merge + economic mapper) |
| `cj-api:deep-quote-smoke` | **GO** if key valid and at least one single-variant product quotes; else **PARTIAL/NO-GO** with console reason (no secrets logged) |

**Real CJ API (executed in dev):** `cj-api:deep-quote-smoke` returned **GO** — `listV2` returned 8 hits; several multi-variant products were skipped; **freightCalculate** succeeded for one product with **shippingUsd ≈ 2.06** (exact value in local stdout only; not committed).

---

## 9. GO / NO-GO

**GO** for Phase C code: selective deep quote, cache, spacing, types, finder + optional API fields, tests, documentation.

**Operational NO-GO** only if: no CJ credential for the **user id** used by `findOpportunities` / smoke user — deep quote then degrades with `failed` counts and estimated shipping remains.

---

## 10. Remaining toward “CJ fully done”

- **Explicit `vid` on discovery** when list API exposes it, or targeted `getProductById` only for top-N **before** freight (higher QPS cost — gate with env).
- **Persistent** freight cache (Redis) shared across instances.
- **UI** for `economicSupplyQuote` (cost breakdown, freshness, deep vs estimated).
- **Multi-variant UX**: user picks variant → deep quote that `vid`.
- **Destination other than US** aligned with opportunity `region` / `targetCountry`.

---

## 11. Estimated CJ vertical completion

Roughly **~88–92%** “real” vs Phase B ~75–80%: discovery + selective freight + economic surface; remaining work is persistence, multi-variant resolution at scale, and non-US parity.
