# P72 — Cover-only rebuild

## Command

```bash
cd backend
npx tsx scripts/p71-rotate-cover.ts 32690 --force-key=sc2ae6d73152646a682a9cf82c78ef794o
```

## Result

| Field | Value |
|--------|--------|
| **Source URL** | `https://ae01.alicdn.com/kf/Sc2ae6d73152646a682a9cf82c78ef794O.jpg` |
| **Object key** | `sc2ae6d73152646a682a9cf82c78ef794o` |
| **Detail preserved** | `detail_mount_interface.png` unchanged |
| **Backup** | `cover_main.pre_p72_backup_<timestamp>.png` |
| **Built `coverMeanRgb`** | **177.92** |
| **`coverBytes`** | **1152787** |

**Material difference vs P71 cover:** different supplier raster (darker mean vs ~226–234 on prior covers) — intentionally the **next** catalog candidate, not a brightness-optimized pick.
