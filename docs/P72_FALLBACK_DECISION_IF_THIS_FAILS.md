# P72 — Fallback decision if this fails

## If **`sc2ae6d7315…`** is live and seller **still** flags only PORTADA

### Next automatic candidate (single remaining ranked URL)

- **`seebee46f53de44599a422ea0e4309288x`** — last distinct supplier key in `products.images` for `32690` (P71 inventory: lowest brightness score; **high risk** of busy/dark composition).

**Command shape (after adding key to `USED_COVER_KEYS` post-success, or use force):**

```bash
npx tsx scripts/p71-rotate-cover.ts 32690 --force-key=seebee46f53de44599a422ea0e4309288x
```

### After `seebee46…` exhausts

1. **Manual seller-side upload** — operator picks a frame from supplier gallery or a new photo in ML editor (still listing-scoped).
2. **Mercado Libre seller support** — attach: only PORTADA flagged, list **all** tried object keys (`sd63839`, `s2eee0bfe`, `sd8adf1f1`, `sc2ae6d7315`, `seebee46` if tried), verbatim UI text.
3. **Re-enrich** — `p66-enrich-product-images.ts 32690` if new supplier URLs are needed (credentials required).

## If P72 never went live (`p49` blocked)

**Next move is not “next cover”** — it is **ML credential recovery**, then **re-run `p49`** with the **already-built** `sc2ae6d7315…` cover pack.
