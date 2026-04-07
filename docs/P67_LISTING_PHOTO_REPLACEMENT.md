# P67 — Listing photo replacement

**Listing:** `MLC3786354420` · **Product:** `32690`

## P67 status

**No replacement executed** in this run: image enrichment did not add a second real supplier URL, so there is **no stronger two-source pack** than the post–P66 state. Running `p49` without a new approved asset set would not advance the stated objective.

## Listing-scoped path (when pack is ready)

1. Rebuild pack: `npx tsx scripts/p66-rebuild-supplier-catalog-pack.ts 32690`
2. Approve assets: `npx tsx scripts/check-ml-asset-visual-approval.ts 32690 --apply`
3. Replace + activate: `npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420`
4. If ML pauses or sets OOS after picture changes: `npx tsx scripts/p66-resume-listing-stock-and-activate.ts 32690 MLC3786354420 <qty>`

## Picture IDs to record on next replacement

**Last known from P66** (pre-P67 replacement — no change in P67):

- `996047-MLC109382626291_032026`
- `978639-MLC108576847120_032026`

**After next successful `p49`:** capture `before` / `after` / `final` from the script JSON (`p49` prints `summarizeSnapshot`).

## Stock / activation

P66 showed that partial picture operations can leave **`paused` / out_of_stock**; always pair replacement with **quantity restore** + **`activateListing`** when needed (`p66-resume-listing-stock-and-activate.ts`).
