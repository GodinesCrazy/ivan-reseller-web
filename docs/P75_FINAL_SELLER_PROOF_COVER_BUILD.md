# P75 — Final seller-proof cover build

## Final artifact

| Field | Value |
|--------|--------|
| Path | `artifacts/ml-image-packs/product-32690/cover_main.png` |
| Dimensions | **1536 × 1536** |
| Approx. bytes | **~255 KB** |
| Full-frame mean RGB (script) | **~225.3** |

## Source (real product)

| Field | Value |
|--------|--------|
| objectKey | `s2eee0bfe21604c31b468ed75b002ecdc8` |
| URL | `https://ae01.alicdn.com/kf/S2eee0bfe21604c31b468ed75b002ecdc8.jpg` |

## Material difference vs P74 (what matters for ML)

| Dimension | P74 | P75 |
|-----------|-----|-----|
| Texto/medidas | Often still present in kept window | **Inset crop removes** top/left/bottom overlay bands |
| Fondo | White + modulate | **#fff canvas** + **neutral shadow crush** |
| Strategy | Generic center crop fraction | **Listing-scoped** `P75_INSETS_32690` |

## detail_mount_interface

**Not modified** — same file as prior pack.

## Experiments not kept

- **1200×1200 `fit: 'cover'` zoom** — rejected: cropped off visible product geometry and hurt catalog readability.
- **White horizontal pad to 1200px width** — did not change ML upload `max_size` string (still ~459px wide subject metric).
