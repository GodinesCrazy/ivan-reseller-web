# P70 — Cover-only rebuild

## Script

**`backend/scripts/p70-rebuild-cover-only.ts`**

```bash
cd backend
npx tsx scripts/p70-rebuild-cover-only.ts 32690
```

## Behavior

- Writes **only** `artifacts/ml-image-packs/product-32690/cover_main.png`.
- **Does not** modify `detail_mount_interface.png` (file preserved on disk).
- Backs up previous cover to `cover_main.pre_p70_backup_<timestamp>.png`.

## Run output (P70)

```json
{
  "strategy": "p70_cover_only_new_supplier_key",
  "newCoverSupplierUrl": "https://ae01.alicdn.com/kf/S2eee0bfe21604c31b468ed75b002ecdc8.jpg",
  "newCoverObjectKey": "s2eee0bfe21604c31b468ed75b002ecdc8",
  "detailPreservedPath": ".../detail_mount_interface.png",
  "coverMeanRgb": 233.96,
  "coverBytes": 333519
}
```

**Material difference vs old cover:** higher mean luminance (~234 vs ~212 from P69 stats) and **different supplier asset** — intended to read as a **cleaner catalog hero**.
