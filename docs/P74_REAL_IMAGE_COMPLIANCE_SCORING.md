# P74 — Real image compliance scoring (product 32690)

## Scope

All distinct AliExpress `S*` object keys from `products.images` for **productId 32690**, excluding the reserved detail slot key **`scdf80a1900764667b3e4c3b600f79325u`** (detail mount only).

## Sources enumerated

| Rank | objectKey | URL |
|------|-----------|-----|
| 1 | `s2eee0bfe21604c31b468ed75b002ecdc8` | `https://ae01.alicdn.com/kf/S2eee0bfe21604c31b468ed75b002ecdc8.jpg` |
| 2 | `sd8adf1f1f796411e96d94f9f8c6d45440` | `https://ae01.alicdn.com/kf/Sd8adf1f1f796411e96d94f9f8c6d45440.jpg` |
| 3 | `sd63839aaf0834ce88fe4e594b8e2f590m` | `https://ae-pic-a1.aliexpress-media.com/kf/Sd63839aaf0834ce88fe4e594b8e2f590M.jpg` |
| 4 | `sc2ae6d73152646a682a9cf82c78ef794o` | `https://ae01.alicdn.com/kf/Sc2ae6d73152646a682a9cf82c78ef794O.jpg` |
| 5 | `seebee46f53de44599a422ea0e4309288x` | `https://ae01.alicdn.com/kf/Seebee46f53de44599a422ea0e4309288X.jpg` |

## Scoring model (deterministic, Sharp)

Implemented in `backend/scripts/p74-execute-cover-strategy.ts`.

### Per-candidate metrics

1. **Edge strips (≈8% border)** — top, bottom, left, right; flattened on white before stats.  
   - **edgeMeanRgb**: mean of R/G/B averages across the four strips (proxy for “light/plain background”).  
   - **edgeAvgStdev**: mean channel stdev across strips (proxy for **texture / text / logos** at periphery).

2. **Center window (58% of min box)** — flattened on white.  
   - **centerMeanRgb**, **centerStdevRgb** — product presence vs empty frame; variation in product core.

3. **Derived scores (0–100 scale, heuristic)**  
   - **textLogoRiskScore** = `min(100, edgeAvgStdev * 2.2 + (255 - edgeMeanRgb) * 0.15)` (higher = worse).  
   - **backgroundSimplicityScore** = `min(100, edgeMeanRgb * 0.35 + (40 - min(40, edgeAvgStdev)) * 1.5)` (higher = better).

4. **directPass** — strict “already catalog-safe” gate (all must hold):  
   - `edgeMeanRgb >= 228`  
   - `edgeAvgStdev <= 22`  
   - `65 <= centerMeanRgb <= 245`  
   - `centerStdevRgb >= 6`

5. **remediationFitness** — ranking for remediation base when no direct pass:  
   - Lighter, less textured edges and visible product core score higher.

## Ranked table (run 2026-03-25)

Sorted: `directPass` first (none), then descending `remediationFitness`.

| objectKey | edgeMean | edgeStdev | centerMean | centerStdev | textRisk | bgSimple | directPass | fitness |
|-----------|----------|-----------|------------|-------------|----------|----------|------------|---------|
| s2eee0bfe… | 230.32 | 55.26 | 230.32 | 55.26 | 100 | 80.61 | false | **60.73** |
| sd8adf1f1… | 218.49 | 47.69 | 218.49 | 47.69 | 100 | 76.47 | false | 56.66 |
| sd63839a… | 197.89 | 48.56 | 197.89 | 48.56 | 100 | 69.26 | false | 52.39 |
| sc2ae6d7… | 152.39 | 66.32 | 152.39 | 66.32 | 100 | 53.34 | false | 46.13 |
| seebee46… | 62.81 | 56.28 | 62.81 | 56.28 | 100 | 21.98 | false | 24.80 |

**Note:** Edge and center statistics can match to two decimal places on bright, fairly uniform supplier frames; ranking still differentiates via exact floating values inside `remediationFitness`.

## Conclusion

No supplier frame passed **directPass**; all five show high edge stdev (texture / busy periphery vs strict ML “plain light” bar). **Best remediation base:** `s2eee0bfe21604c31b468ed75b002ecdc8` (highest fitness, brightest edges among the set).
