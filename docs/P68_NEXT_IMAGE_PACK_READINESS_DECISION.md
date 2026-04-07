# P68 — Next image-pack readiness decision

**Product:** `32690` · **Listing:** `MLC3786354420`

## Decision

**`ready_for_two_distinct_pack_rebuild` — YES**

Rationale:

- `products.images` now contains **multiple** supplier URLs with **different normalized paths** (not only query-variant duplicates).
- `p66-rebuild-supplier-catalog-pack.ts` selects the first **norm-distinct** URL after the cover for **`detail_mount_interface`**.

## Recommended next commands (listing-scoped, unchanged from P67 doc chain)

```bash
cd backend
npx tsx scripts/p66-rebuild-supplier-catalog-pack.ts 32690
npx tsx scripts/check-ml-asset-visual-approval.ts 32690 --apply
npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
```

If ML pauses or zeroes stock after picture replace, use **`p66-resume-listing-stock-and-activate.ts`** as in P66.

## Fallbacks (only if rebuild/upload fails)

- Operator seller-side photo upload + verbatim ML reason capture (`docs/P67_SELLER_REASON_CAPTURE_PATH.md`).
- ML seller support with structured blocker notes.
- One-photo + derivative detail: **last resort** — no longer required for *source* variety now that the DB has a real multi-image set.
