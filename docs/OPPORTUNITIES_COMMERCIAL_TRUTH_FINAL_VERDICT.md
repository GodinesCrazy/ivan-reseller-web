# Opportunities commercial truth — final verdict

**Verdict:** `OPPORTUNITIES_PARTIALLY_REAL_PARTIALLY_ESTIMATED_HONESTLY` → trending to **`OPPORTUNITIES_REAL_VALUES_WORKING`** when eBay app keys exist and region/site mapping matches the operator.

## Why not “always real”

- **Amazon** comparables still depend on full Amazon credentials; without them, Amazon is skipped but **ML public + eBay** can still yield exact suggested prices.
- If **all** comparators fail (network, rate limits, zero results), the pipeline correctly falls back to **heuristic** pricing and marks `commercialTruth` as estimated.

## What was wrong before

The UI implied seller OAuth for Mercado Libre was mandatory for comparables; the analyzer skipped ML on credential `issues`; eBay required user token only; errors were silent; cache hid refreshed credentials.

## What is true after the fix

- Mercado Libre comparables use **public** search; refreshed ML OAuth is **not** the gate for that signal.
- eBay comparables can use **application** tokens when user OAuth is absent but keys exist.
- Rows expose **`commercialTruth`** and **`competitionSources`** for audits.
- Saving marketplace credentials **invalidates** per-user opportunities cache.

## Next human check

Authenticated search on Opportunities with a LATAM region (e.g. Chile) and a common keyword; expect **Real** badges and `mercadolibre_public_catalog` in comparables line when ML returns results.
