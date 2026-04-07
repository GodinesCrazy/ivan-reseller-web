# P66 — Listing photo replacement

## Timeline (same sprint)

### A) Discarded path — single picture only

**Command:** `npx tsx scripts/p66-replace-single-listing-picture.ts 32690 MLC3786354420`

| Field | Value |
|--------|--------|
| `beforePictureCount` | 2 |
| `afterPictureCount` | 1 |
| `pictureIdsAfter` | `987593-MLC108577312750_032026` |
| `status` | `paused` |
| `sub_status` | `out_of_stock`, `paused_by_seller` |

**Conclusion:** **Do not use** this path for routine recovery — script header marked **deprecated / forensic only**.

### B) Restored two-picture set — `p49`

**Command:** `npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420`

**Picture IDs:**

| Phase | IDs |
|--------|-----|
| Before (after single-picture state) | `987593-MLC108577312750_032026` |
| After replace | `996047-MLC109382626291_032026`, `978639-MLC108576847120_032026` |

**Immediately after `p49`:** `status` remained **`paused`**, `sub_status` included **`out_of_stock`** (quantity issue, not only photos).

### C) Stock + activation recovery

**Command:** `npx tsx scripts/p66-resume-listing-stock-and-activate.ts 32690 MLC3786354420 3`

| Field | Value |
|--------|--------|
| `availableQuantitySet` | 3 |
| `status` | `active` |
| `sub_status` | `[]` |

## Upload sizes (p49 logs)

- Image 1 → **118 625** bytes  
- Image 2 → **94 616** bytes  

## Reference: P65 end state (for diff)

- **643675-MLC109382559801_032026**, **748128-MLC109382649837_032026** (two full-frame from same URL)
