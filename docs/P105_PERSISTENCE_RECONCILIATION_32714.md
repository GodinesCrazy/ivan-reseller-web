# P105 — Persistence reconciliation (32714)

## Product row

From **`p104-persistence-32714.json`** (snapshot time 2026-03-27):

- **`products.id`**: `32714`
- **`status`**: `APPROVED`
- **`isPublished`**: `false` (application flag vs marketplace reality — treat listings as source of truth for “live”).

**P105 dry-run** did **not** update **`productData`** (`dryRun: true` in `p105-live-result.json`). A production P105 run without `--dry-run` would persist **`mlImagePipeline.portadaSupplementHero*`** fields.

## `marketplace_listings` (Mercado Libre)

Rows for product **32714** included (snapshot):

| listingId       | status (row)   |
|-----------------|----------------|
| MLC3805190796   | failed_publish |
| MLC3804623142   | failed_publish |
| MLC3804135582   | failed_publish |

**Reconciliation note:** P104/P105 did not change these rows in this pass. Any **failed_publish** / **`isPublished`** drift should be reconciled only after a **confirmed** successful ML publish or update and Seller Center alignment.

## Pack / disk

- **`ml-asset-pack.json`** exists under **`artifacts/ml-image-packs/product-32714/`**.
- **`cover_main.png`** was **not** overwritten by P105 in the failed run (rebuild exited first).

## Recommended next DB action

After a **successful** P105 apply: run **`p104-persistence-snapshot-32714.ts`** (or equivalent) and compare **`marketplace_listings.status`** / **`listingId`** to Seller Center.
