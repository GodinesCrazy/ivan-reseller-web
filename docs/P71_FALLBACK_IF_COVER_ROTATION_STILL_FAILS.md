# P71 — Fallback if cover rotation still fails

## If seller still flags **only PORTADA** after **`sd8adf1f1…`**

### 1. Next automated rotation (preferred)

Re-run:

```bash
cd backend
npx tsx scripts/p71-rotate-cover.ts 32690
```

**`backend/scripts/p71-rotate-cover.ts`** now includes **`sd8adf1f1f796411e96d94f9f8c6d45440`** in **`USED_COVER_KEYS`** so the next run ranks only:

- **`sc2ae6d73152646a682a9cf82c78ef794o`** (2nd in P71 pre-rank)
- **`seebee46f53de44599a422ea0e4309288x`** (3rd; dark — consider manual override)

Then **`check-ml-asset-visual-approval.ts 32690 --apply`** → **`p49`**.

### 2. Manual operator index

If heuristics pick the wrong asset, extend **`p71-rotate-cover.ts`** with an optional argv **`--force-object-key <key>`** (future) or temporarily remove a key from ranking by adding it to **`USED_COVER_KEYS`** and paste the chosen URL into a one-off rebuild.

### 3. Seller editor one-by-one

Upload a **single** new main photo in ML UI (same supplier set downloaded locally), preserving order — last resort when API rotation and ML moderation disagree.

### 4. Mercado Libre support

Escalate with: **only portada flagged**, **secondary OK**, list of **tried object keys** (`sd63839`, `s2eee0bfe`, `sd8adf1f1`, …) and **verbatim** seller error text.

### 5. Enrichment gap

If all distinct keys are exhausted, re-run **`p66-enrich-product-images.ts 32690`** (requires creds) before new candidates exist — **listing-scoped**, same product only.
