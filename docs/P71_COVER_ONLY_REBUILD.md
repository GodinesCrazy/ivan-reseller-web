# P71 — Cover-only rebuild

## Script

**`backend/scripts/p71-rotate-cover.ts`**

```bash
cd backend
npx tsx scripts/p71-rotate-cover.ts 32690
```

## Behavior

- Loads distinct supplier URLs from DB, applies **used-cover** + **detail-slot** exclusions, **scores** eligible candidates, writes **`cover_main.png`** only.
- **`detail_mount_interface.png`** is not modified.
- Backs up prior cover to `cover_main.pre_p71_backup_<timestamp>.png`.

## P71 run metrics

| Field | Value |
|--------|--------|
| Built **`coverMeanRgb`** (1536² pack) | **226.62** |
| **`coverBytes`** | **853703** |

Compare P70 cover (same pipeline, different source): mean ~**233.96** — P71 source produces a **different** catalog tile (different supplier raster and post-process stats).
