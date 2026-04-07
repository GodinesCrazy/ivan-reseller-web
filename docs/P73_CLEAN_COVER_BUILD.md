# P73 — Clean cover build

## Command

```bash
cd backend
npm run type-check
npx tsx scripts/p73-build-clean-catalog-cover.ts 32690
```

## Execution result

| Field | Value |
|--------|--------|
| **Strategy** | `p73_clean_catalog_cover_center_crop_flat_light_bg` |
| **Center keep** | **0.72** (14% removed each side) |
| **Catalog BG** | `rgb(248, 249, 250)` |
| **Selected source key** | **`s2eee0bfe21604c31b468ed75b002ecdc8`** (highest **centerMeanRgb** among candidates) |
| **Selected source URL** | `https://ae01.alicdn.com/kf/S2eee0bfe21604c31b468ed75b002ecdc8.jpg` |
| **Ranking (center mean)** | `s2eee` 230.32 → `sd8adf` 218.49 → `sd63839` 197.89 → `sc2ae6d` 152.39 → `seebee` 62.81 |
| **Output mean RGB** | **228.58** |
| **Output size** | **338101** bytes |
| **Detail file** | **Not modified** |

## Backup

`cover_main.pre_p73_backup_<timestamp>.png`
