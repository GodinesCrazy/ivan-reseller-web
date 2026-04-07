# P72 — Forced next cover selection

**Product:** `32690` · **Listing:** `MLC3786354420`

## Seller-truth update (post-P71)

- **`sd8adf1f1f796411e96d94f9f8c6d45440`** is treated as **attempted and still rejected** on **PORTADA** (seller UI unchanged per operator evidence).
- **`sc2ae6d73152646a682a9cf82c78ef794o`** is the **next ranked** untried candidate from `docs/P71_COVER_CANDIDATE_INVENTORY.md` / P71 ranking.

## Forced selection (no heuristic winner tie-break)

| Field | Value |
|--------|--------|
| **Forced object key** | **`sc2ae6d73152646a682a9cf82c78ef794o`** |
| **Supplier URL** | `https://ae01.alicdn.com/kf/Sc2ae6d73152646a682a9cf82c78ef794O.jpg` |

## Implementation

`backend/scripts/p71-rotate-cover.ts` supports:

```bash
npx tsx scripts/p71-rotate-cover.ts 32690 --force-key=sc2ae6d73152646a682a9cf82c78ef794o
```

Strategy logged: **`p72_forced_cover_object_key`**.

## Secondary image

**`detail_mount_interface.png`** — **not** modified (same file as P71).

## `USED_COVER_KEYS` (post-P72 code state)

Includes **`sc2ae6d73152646a682a9cf82c78ef794o`** so default ranked runs do not reuse it; **`seebee46f53de44599a422ea0e4309288x`** remains the **only** automatic-eligible key if ranked mode is used next.
