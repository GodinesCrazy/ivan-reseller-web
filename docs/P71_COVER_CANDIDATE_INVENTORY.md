# P71 — Cover candidate inventory

**Product:** `32690` · **Source:** `products.images` (flattened, unique by `/kf/S…` object key)

## Full inventory (execution snapshot)

| Object key | Representative URL | Used as cover before (P69/P70) | Detail slot (P69) | P71 eligible |
|------------|---------------------|--------------------------------|-------------------|--------------|
| `sd63839aaf0834ce88fe4e594b8e2f590m` | `https://ae-pic-a1.aliexpress-media.com/kf/Sd63839aaf0834ce88fe4e594b8e2f590M.jpg` | Yes (P69) | No | No |
| `scdf80a1900764667b3e4c3b600f79325u` | `https://ae01.alicdn.com/kf/Scdf80a1900764667b3e4c3b600f79325U.jpg` | No | Yes | No |
| `s2eee0bfe21604c31b468ed75b002ecdc8` | `https://ae01.alicdn.com/kf/S2eee0bfe21604c31b468ed75b002ecdc8.jpg` | Yes (P70) | No | No |
| `seebee46f53de44599a422ea0e4309288x` | `https://ae01.alicdn.com/kf/Seebee46f53de44599a422ea0e4309288X.jpg` | No | No | Yes |
| `sd8adf1f1f796411e96d94f9f8c6d45440` | `https://ae01.alicdn.com/kf/Sd8adf1f1f796411e96d94f9f8c6d45440.jpg` | No (until P71) | No | Yes |
| `sc2ae6d73152646a682a9cf82c78ef794o` | `https://ae01.alicdn.com/kf/Sc2ae6d73152646a682a9cf82c78ef794O.jpg` | No | No | Yes |

## Ranking heuristic (automated)

For each **eligible** URL, download supplier JPEG and compute:

- **`pixels`** = native `width × height` (800×800 → 640000 in practice for these assets).
- **`meanRgb`** = mean of R/G/B on flattened RGB (proxy for “bright / light background”).
- **`score`** = `pixels × (meanRgb / 255)` — prefer **larger** and **brighter** as a weak **catalog-cleanliness** prior (not Mercado Libre ground truth).

## Ranked eligible candidates (pre-selection)

1. **`sd8adf1f1f796411e96d94f9f8c6d45440`** — score **548370.56**, meanRgb **218.49**
2. **`sc2ae6d73152646a682a9cf82c78ef794o`** — score **382458.92**, meanRgb **152.39**
3. **`seebee46f53de44599a422ea0e4309288x`** — score **157638.43**, meanRgb **62.81** (dark / busy — lowest rank)
