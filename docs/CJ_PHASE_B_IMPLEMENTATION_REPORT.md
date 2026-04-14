# CJ / Supply — Phase B implementation report (preference, fallback, unified discovery)

## 1. Executive summary

Phase B is **implemented in code**: a **`SupplyQuoteService`** centralizes AliExpress Affiliate + CJ list discovery, respects **`OPPORTUNITY_CJ_SUPPLY_MODE`** (`off` | `merge` | `fallback`), adds **per-user supplier preference** (`aliexpress` | `cj` | `auto`) with env default **`OPPORTUNITY_SUPPLIER_PREFERENCE`**, normalizes rows with **`supplyMeta`** (cost/shipping truth + confidence), ranks/dedupes in **`auto`**, and feeds **`opportunity-finder.service.ts`** without reintroducing duplicate CJ logic in the legacy fallback chain.

**Result: GO** (see §7). **Prisma migration** must be applied in each environment (`user_settings.opportunitySupplierPreference`).

---

## 2. Prior state

- CJ adapter + QPS/429 handling operational.
- `OPPORTUNITY_CJ_SUPPLY_MODE` wired directly inside `opportunity-finder` with `cjSearchForOpportunityRows`.
- No unified supplier preference or shared contract for “discovery rows”.

---

## 3. What was implemented

| Area | Detail |
|------|--------|
| **Unified service** | `supplyQuoteService.discoverForOpportunities(ctx)` orchestrates Affiliate + CJ, logs redacted pipeline outcomes. |
| **Types** | `supply-quote.types.ts`: `SupplyDiscoveryRow`, `SupplyRowMeta`, `SupplyDiscoveryDiagnostics`, etc. |
| **Ranking / dedupe** | `supply-quote-rank.ts`: landed-cost sort + title/price-bucket dedupe (pure, unit-tested). |
| **Affiliate mapping** | `opportunity-affiliate-mapping.ts`: extracted from `opportunity-finder` for reuse. |
| **User preference** | `user_settings.opportunitySupplierPreference` (nullable); `UserSettingsService.getOpportunitySupplierPreference()`; DTO + `updateUserSettings` validation. |
| **Env** | `OPPORTUNITY_SUPPLIER_PREFERENCE` (default `auto`). |
| **Opportunity finder** | `useAffiliateOnly` path calls `supplyQuoteService`; **legacy** `runDiscoveryFallback` is **eBay/scraper/cache/AI only** (CJ no longer duplicated here). |
| **API response** | `OpportunityItem.supplyDiagnostics` + `PipelineDiagnostics.supplyQuotePhaseB` when diagnostics collector is used. |
| **Frontend types** | `Opportunities.tsx`: optional `supplyDiagnostics`. |
| **CJ rows** | `cjSearchForOpportunityRows(..., { skipEnvGate: true })` for internal use when `SupplyQuoteService` already decided CJ is allowed. |

### Cost / shipping strategy (Phase B scope)

- **AliExpress**: unit cost from listing; shipping **confirmed** when Affiliate enrichment returns `shippingCost > 0`, else **estimated** for downstream heuristics.
- **CJ**: list price only at discovery scale; **`defaultChinaUsShippingUsd`** (user commerce settings) applied as **estimated** shipping on the row to avoid mass `freightCalculate` (QPS). Documented as **listing + estimated shipping**, not CJ-confirmed freight.

---

## 4. Files touched (created or modified)

**New**

- `backend/src/services/supply-quote.types.ts`
- `backend/src/services/supply-quote-rank.ts`
- `backend/src/services/supply-quote.service.ts`
- `backend/src/services/opportunity-affiliate-mapping.ts`
- `backend/src/services/__tests__/supply-quote.service.test.ts`
- `backend/prisma/migrations/20260413163000_user_settings_opportunity_supplier_preference/migration.sql`
- `docs/CJ_PHASE_B_IMPLEMENTATION_REPORT.md` (this file)

**Modified**

- `backend/prisma/schema.prisma` — `UserSettings.opportunitySupplierPreference`
- `backend/src/config/env.ts` — `OPPORTUNITY_SUPPLIER_PREFERENCE`
- `backend/src/services/user-settings.service.ts` — preference read/write; `let`→`const` fix in commerce clamp
- `backend/src/services/opportunity-finder.service.ts` — supply-quote integration, diagnostics, exports
- `backend/src/services/opportunity-finder.types.ts` — `OpportunitySupplyDiagnostics`, `supplyDiagnostics` on `OpportunityItem`
- `backend/src/modules/cj-ebay/services/cj-opportunity-supply.service.ts` — optional `skipEnvGate`
- `backend/.env.example` — documented env vars
- `frontend/src/pages/Opportunities.tsx` — optional `supplyDiagnostics`

---

## 5. Preference / fallback logic (short)

- **`aliexpress`**: Affiliate first; CJ only if `OPPORTUNITY_CJ_SUPPLY_MODE` is `merge` (append) or `fallback` (when Affiliate empty). Same effective rules as before, centralized.
- **`cj`**: CJ first when CJ mode ≠ `off`; if empty, Affiliate. If CJ mode `off`, Affiliate only + pipeline note `cj_preference_but_cj_mode_off`.
- **`auto`**: Fetches CJ when mode allows (`merge` includes both empty and non-empty Affiliate for broader comparison; `fallback` when Affiliate empty; plus `auto`+`merge` path in service). Results merged and **rank/dedup** by estimated landed cost.

Legacy **non–Affiliate-only** branches in `opportunity-finder` remain unchanged (still use `mapAffiliateProductToDiscoveryRow`).

---

## 6. Unified contract (summary)

**Input** (`SupplyDiscoveryContext`): `userId`, `query`, `maxItems`, `pageNo`, `baseCurrency`, `region`, `environment`, `defaultShippingUsd`.

**Output** (`SupplyDiscoveryResult`):

- `rows[]`: discovery-shaped rows + optional `supplyMeta` (`supplier`, `unitCostTruth`, `shippingTruth`, `landedCostTruth`, `quoteConfidence`, `preferredSupplierSatisfied`, `fallbackUsed`, `providersAttempted`).
- `diagnostics`: `sourcesTried`, `preference`, `cjSupplyMode`, `notes`, `degradedPartial`.

---

## 7. Tests and commands run

| Command | Result |
|---------|--------|
| `Set-Location backend; npm run type-check` | **Exit 0** |
| `Set-Location backend; npx jest src/services/__tests__/supply-quote.service.test.ts --no-cache` | **Pass** (2 tests: dedupe prefers lower landed cost; distinct titles kept) |
| `npx prisma generate` | **EPERM** on Windows rename of `query_engine-windows.dll.node` in this environment (client may already be current); **not a code defect** |
| `npx eslint` on `supply-quote*.ts`, `opportunity-affiliate-mapping.ts`, `cj-opportunity-supply.service.ts` (`--max-warnings 0`) | **Exit 0** |

`opportunity-finder.service.ts` still triggers many **pre-existing** ESLint warnings/errors if linted with `--max-warnings 0`; Phase B did not expand that surface beyond the supply integration.

**Not run here (needs live creds + DB migration):** end-to-end `findOpportunities` with all three preferences against production APIs. After `prisma migrate deploy`, validate manually:

1. `OPPORTUNITY_SUPPLIER_PREFERENCE=aliexpress`, `OPPORTUNITY_CJ_SUPPLY_MODE=off` → Affiliate only.
2. Same with `merge` + CJ key → Affiliate + CJ append.
3. `OPPORTUNITY_SUPPLIER_PREFERENCE=cj`, CJ mode `fallback`, break Affiliate → CJ rows then legacy if both empty.
4. `auto` + `merge` + both keys → ranked mix.
5. One provider failing → partial/degraded, other still listed when applicable.

---

## 8. GO / NO-GO

**GO** for Phase B delivery: unified layer, preference + fallback, finder integration, tests, documentation. **Blocker for DB persistence of preference:** apply migration `20260413163000_user_settings_opportunity_supplier_preference`.

---

## 9. Pending for Phase C (next)

- Per-opportunity **deep CJ freight** (`freightCalculate` / `quoteShippingToUsReal`) for shortlisted SKUs only + cache TTL.
- **User-facing** settings UI for `opportunitySupplierPreference`.
- Richer **dedupe** (image fingerprint, fuzzy title) and **multi-metric** ranking (stock signal, delivery band).
- **SupplyQuoteService** extension for explicit `targetCountry` / marketplace-specific landed cost rules.

---

## 10. Estimated progress (CJ vertical vs “fully done”)

Roughly **~75–80%** toward “CJ as first-class supply” inside Ivan_Reseller_Web: core API, eBay vertical, opportunity discovery integration, preference, and unified discovery are in place; remaining work is mostly **deep quoting**, **UI settings**, and **global publish/fulfillment** neutrality across marketplaces.
