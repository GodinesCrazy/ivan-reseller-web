# P96 — Canonical auto-price uplift (MLC, product 32714)

## Status: DONE (integration + persistence)

### Section 1 — Code verification (before fix)

- `computeCanonicalProfitablePrice()` existed in `backend/src/services/pre-publish-validator.service.ts` but used `computeProfitAfterFees`, which does **not** match the preventive / fee-intelligence path used by `runPreventiveEconomicsCore`.
- `prepareProductForSafePublishing()` was **broken**: it referenced undefined `econ` (TypeScript error risk; runtime would throw).
- `computeCanonicalProfitablePrice` also had a typo: return field `iterations` used an undefined identifier (fixed to `iteration`).
- Persistence: `persistPreventivePublishPreparation()` only wrote `finalPrice` when `upliftPriceUsd` was passed; callers often omitted it, so uplift was easy to lose.

### Section 2 — Integration delivered

**File edited:** `backend/src/services/pre-publish-validator.service.ts`

**Functions touched:**

1. **`runPreventiveEconomicsCore`** — New optional param `allowUnprofitableListing?: boolean`. When `true`, supplier + freight truth + fee ledger checks still apply; profit/margin floor failures are **not** returned as errors (used to compute uplift from the current listing).

2. **`preventiveListingMeetsProfitFloors`** (internal) — Same conditions as the strict core: `PRE_PUBLISH_MIN_NET_PROFIT` (default 0.01) and `PRE_PUBLISH_MIN_MARGIN_RATIO` (default 0.10).

3. **`findMinimumProfitableListingSalePriceUsd`** (internal) — Iteratively raises USD listing price using **`calculatePreventiveProfit`** until floors pass (aligned with canonical MLC economics).

4. **`prepareProductForSafePublishing`** — Flow:
   - Draft economics with `allowUnprofitableListing: true`.
   - If floors fail on the requested listing, compute minimum compliant USD sale price and re-run strict `runPreventiveEconomicsCore` with that price.
   - **Persist** `finalPrice`, `suggestedPrice`, `totalCost`, `shippingCost`, and `importTax` to Postgres **before** the Mercado Libre image remediation pipeline so pricing truth survives image fail-closed behavior.
   - Record `preventivePublish.canonicalPriceUplift` in `metadataPatch` when uplift applies.

5. **`persistPreventivePublishPreparation`** — Always sets `finalPrice` / `suggestedPrice` from `preparation.listingSalePrice` when no explicit `upliftPriceUsd` override is provided (keeps DB aligned with the validated listing).

6. **`computeCanonicalProfitablePrice`** — Documented as diagnostic / legacy vs cost-calculator; publish path uses `findMinimumProfitableListingSalePriceUsd`.

### Section 3 — Exact proof for product 32714 (observed run)

| Field | Value |
|--------|--------|
| Old MLC listing (DB / effective) | **7.02 USD** |
| Old real profit (preventive economics) | **-2.07 USD** (sale 7.02 vs total cost **9.09 USD**) |
| New uplifted listing (persisted) | **12.00 USD** |
| Floors used | `PRE_PUBLISH_MIN_NET_PROFIT` default **0.01**; `PRE_PUBLISH_MIN_MARGIN_RATIO` default **0.10** |
| Proof log line | `[PRE-PUBLISH] canonical listing price uplift applied` with `requestedListingSalePriceUsd: 7.02`, `upliftedListingSalePriceUsd: 12` |

Post-uplift, **`runPreventiveEconomicsCore` at the persisted listing price succeeds** (preflight no longer emits a `pricing:*` blocker when reading `finalPrice` **12** from the database).

`computeCanonicalProfitablePrice()` is **not** used on the canonical publish path anymore; parity is enforced via `calculatePreventiveProfit` inside `findMinimumProfitableListingSalePriceUsd`.
