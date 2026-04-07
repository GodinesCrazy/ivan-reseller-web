# AliExpress-Only Business Gap Map

Date: 2026-03-21
Constraint: AliExpress remains the only supplier family allowed for the first profitable operation unless evidence proves exhaustion

## Core Verdict

AliExpress-only is not exhausted, but it is not currently sufficient for the first profitable operation under current live conditions.

The blocker is not a total lack of supplier capability in code. The blocker is that the live business pipeline still fails before it reaches a truthful, profitable, released-funds outcome.

## What Is Truly Usable Today

| Capability | Current state | Evidence-led view |
| --- | --- | --- |
| Affiliate discovery | Usable | Real affiliate discovery and alternative-product search exist and are among the strongest supplier surfaces in the codebase |
| Dropshipping validation | Usable but incomplete | Preventive supplier validation calls real AliExpress dropshipping product info and rejects unsafe candidates |
| Preventive supplier audit | Strong | The system already classifies real supplier failures such as `supplier_unavailable` |
| Fallback ranking | Partial | Alternative lookup exists, but there is no proof that fallback ranking is producing validated-ready outputs |
| Alternative-product fallback | Partial to strong | Present in code, but not proven to recover enough viable candidates in production |
| Stock checks | Partial | Validation checks stock truth, but repeated `no_stock_for_destination` still dominates |
| Shipping checks | Partial | Logic exists, but live data shows massive missing shipping truth |
| Cost extraction | Partial | Cost components are modeled, but live product coverage is near-zero for shipping cost, tax, and total cost |
| Product identity / SKU resolution | Weak in live data | AliExpress SKU handling exists in code, but live catalog has almost no persisted `aliexpressSku` coverage |
| Destination compatibility checks | Strong design, weak live output | Destination-first safety is embedded in validation, but output yield remains zero |
| Purchase execution | Partial | AliExpress auto-purchase exists, but commercially valid proof is missing |
| Tracking retrieval | Partial | Tracking services exist, but current sync results are weak and unproven for valid commerce |

## What Is Strong

- AliExpress is the only supplier family with real breadth across discovery, validation, and purchase orchestration
- preventive supplier validation is commercially meaningful and tied to actual rejection reasons
- the codebase already tries alternative AliExpress products instead of giving up immediately
- the system knows how to reject unsafe supplier situations instead of publishing fantasy listings

## What Is Weak

- destination-valid stock truth still fails too often
- destination-valid shipping truth is mostly absent in persisted catalog data
- SKU persistence is weak enough to cripple repeatable validation
- total landed cost is missing for almost the entire catalog
- purchase execution does not prove supplier-side PayPal settlement

## What Has Been Tried Repeatedly Already

- repeated recovery under eBay US conditions
- repeated validation cycles that still ended with `VALIDATED_READY = 0`
- repeated supplier rejections concentrated around:
  - `no_stock_for_destination`
  - `margin_invalid`
  - `supplier_unavailable`

## Quantified Current Blockers

Live DB evidence from 2026-03-21 shows:

- `validatedReadyCount = 0`
- `totalProducts = 32650`
- `withoutTargetCountry = 32638`
- `withoutShippingCost = 32650`
- `withoutImportTax = 32650`
- `withoutTotalCost = 32650`
- `withoutAliExpressSku = 32649`

These are not small misses. They mean AliExpress-only validation is not failing at the last inch. It is failing at the core operational truth layer for almost the whole catalog.

## Why AliExpress-Only Still Has Optimization Room

AliExpress-only should not be declared exhausted yet because the system has not fully exploited the strongest operational path available inside the current rules.

Remaining optimization room:

1. Move from broad catalog accumulation to destination-first candidate generation
2. Require SKU capture at product ingestion or immediately reject the record from commercial workflows
3. Persist shipping-cost and import-cost truth before any product can become `APPROVED`
4. Use smaller high-confidence search batches based on niches with historically better AliExpress shipping coverage
5. Downrank patterns that repeatedly cause `no_stock_for_destination` and `supplier_unavailable`
6. Separate commercial-grade candidates from legacy artifacts much earlier in the pipeline

## What Is Blocking The First Profitable Operation

The first profitable AliExpress-only operation is blocked by a combination of business reality and implementation reality:

Business reality:

- many AliExpress products do not have safe stock, shipping, or margin truth for the intended destinations

Implementation reality:

- the system is not persisting enough destination, shipping, tax, and SKU truth at scale
- current marketplace credential health is degraded
- supplier-side PayPal payment completion is not proven

## Honest Conclusion

AliExpress-only remains the correct supplier strategy for now because:

- it is the only production-usable supplier family in the codebase
- the code depth is already meaningful
- current failure evidence does not prove supplier-family exhaustion

But AliExpress-only is not enough today to achieve the finish line because:

- it yields zero validated-ready candidates
- it has not produced a commercially valid automated purchase with proven PayPal settlement
- it has not produced released marketplace funds or realized profit

Current classification: `STRONG BUT INCOMPLETE`

Business conclusion: AliExpress-only should remain the main path, but the software is not ready for first real profit until supplier truth coverage and payment execution are fixed.
