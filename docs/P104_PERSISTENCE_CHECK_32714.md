# P104 — Persistence check (32714)

## Script

```bash
cd backend
npx tsx scripts/p104-persistence-snapshot-32714.ts
```

**Artifact:** `p104-persistence-32714.json` (repo root).

## Snapshot highlights (`2026-03-27T19:32:43.061Z`)

### `products` row (32714)

- `userId`: 1  
- `status`: **APPROVED**  
- `isPublished`: **false**  
- `publishedAt`: **null**  

(Contrasts with `p101-republish-result.json`, where `productRowAfter` showed `PUBLISHED` — DB has since diverged or was reconciled differently.)

### `marketplace_listings` (latest first)

| id | listingId | status (app) | listingUrl |
|----|-----------|--------------|------------|
| 1368 | MLC3805190796 | **failed_publish** | articulo … MLC-3805190796 … |
| 1367 | MLC3804623142 | failed_publish | … |
| 1366 | MLC3804135582 | failed_publish | … |

`sku` field stores `status:active` for these rows — treat **listing row `status`** as internal reconciliation, not ML item health.

### Pack on disk

- **Dir:** `artifacts/ml-image-packs/product-32714`
- **Manifest:** present; `listingId` = `MLC3805190796`
- **cover_main.png:** exists (P102 lineage, unchanged by P103)
- **detail_mount_interface.png:** exists

### Dirty / partial state

- **Product not published** in DB while **multiple ML listing rows** exist → operator should reconcile “source of truth” (Seller Center vs DB) after next successful publish.
- **P103 did not update** manifest or cover (rebuild failed closed).
