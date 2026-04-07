# P74 — Final cover build

## Strategy used

**Remediation** (not direct selection).

## Source

| Field | Value |
|--------|--------|
| Supplier objectKey | `s2eee0bfe21604c31b468ed75b002ecdc8` |
| Supplier URL | `https://ae01.alicdn.com/kf/S2eee0bfe21604c31b468ed75b002ecdc8.jpg` |

## Artifact

| Field | Value |
|--------|--------|
| Path | `artifacts/ml-image-packs/product-32690/cover_main.png` |
| Local dimensions | **1536 × 1536** (verified via Sharp) |
| Build script | `backend/scripts/p74-execute-cover-strategy.ts` |
| Post-build mean RGB (full frame, script stat) | **≈229.4** (high-key, near-white field) |
| File size (approx.) | **~308 KB** PNG |

## Alignment with seller reasons

| Seller reason | Intended mitigation |
|---------------|---------------------|
| Logos/text | 0.64 center crop removes outer band; modulate reduces “marketing” pop |
| Non-light / textured background | Replaced with flat **white** 1536 canvas; product on seamless field |

## Secondary image

**Unchanged:** `artifacts/ml-image-packs/product-32690/detail_mount_interface.png` (detail slot key still excluded from cover scoring).

## ML upload note

During `p49`, the MercadoLibre client logged a **dimension warning** for the cover upload (`max_size` reported **761×1200** in API-style string) while the **local file remains 1536×1536**. Treat as **monitoring item** if ML surfaces a new “resolution” warning in seller UI; see `P74_LIVE_COVER_REPLACEMENT.md` and `P74_NEXT_DECISION.md`.
