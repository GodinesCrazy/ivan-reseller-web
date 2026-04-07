# P71 — Next best cover selection

## Exclusions (non-negotiable)

| Rule | Keys / rationale |
|------|-------------------|
| Already used as PORTADA | `sd63839…` (P69), `s2eee0bfe…` (P70) |
| Secondary slot source | `scdf80a…` (keep distinct from current detail) |

## Selected candidate

| Field | Value |
|--------|--------|
| **`selectedObjectKey`** | **`sd8adf1f1f796411e96d94f9f8c6d45440`** |
| **`selectedCoverUrl`** | `https://ae01.alicdn.com/kf/Sd8adf1f1f796411e96d94f9f8c6d45440.jpg` |

## Rejected alternatives (this rotation)

| Key | Reason |
|-----|--------|
| `sc2ae6d73152646a682a9cf82c78ef794o` | Lower **score** and lower **meanRgb** vs winner (darker / less “catalog bright” prior). |
| `seebee46f53de44599a422ea0e4309288x` | Lowest **meanRgb** (~62.8) — likely busy or dark composition; poor fit for ML-safe portada heuristic. |

## Selection rationale (summary)

Pick the **highest-ranked** eligible supplier image under the P71 scoring function so the new PORTADA is **materially different** from P69/P70 keys and **heuristically cleaner/brighter** than the other untried options.
