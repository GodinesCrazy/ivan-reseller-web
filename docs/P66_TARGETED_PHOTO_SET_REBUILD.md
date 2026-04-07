# P66 — Targeted photo set rebuild

## Script

`backend/scripts/p66-rebuild-supplier-catalog-pack.ts`

## Output (this sprint)

```json
{
  "productId": 32690,
  "strategy": "single_supplier_url_cover_plus_distinct_zoom_detail",
  "supplierUrlsUsed": [
    "https://ae-pic-a1.aliexpress-media.com/kf/Sd63839aaf0834ce88fe4e594b8e2f590M.jpg"
  ],
  "coverMeanRgb": 212.19,
  "coverStdevRgb": 47.77,
  "detailMeanRgb": 215.24,
  "detailStdevRgb": 45.42,
  "identicalCoverDetail": false
}
```

## Technical summary

- **Cover:** full supplier frame, max **1320×1320** inside **1536×1536** neutral **RGB(240,242,245)** canvas; sharpen + slight saturation/brightness.
- **Detail:** **62%** center extract of the **same** download, then same canvas pipeline (distinct pixels vs cover).
- **Backups:** `cover_main.pre_p66_backup_<timestamp>.png`, `detail_mount_interface.pre_p66_backup_<timestamp>.png`.

## Anti-patterns avoided

- No **SVG** product illustration.
- No **byte-identical** dual upload for P49.
- No persistent **single-picture** listing state (reverted operationally — see replacement doc).
