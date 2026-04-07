# P70 — New cover spec

## Goals (ML catalog-safe)

- **Single product protagonist**, centered, large in frame on **neutral light gray catalog canvas** (existing pack pipeline: 1536², inner max 1320).
- **No added text, logos, arrows, promos, or collage** — processing is **resize + mild sharpen/saturation** only on a **real supplier photograph** (no synthetic “ad” render).
- **Visually distinct** from the rejected cover: different AliExpress **`/kf/S…`** object id so the raster is not the same supplier asset as **`Sd63839…`**.

## Source selection rule (P70)

1. Load `products.images` (flatten `;`-joined chunks).
2. **Exclude** object keys:
   - **`sd63839aaf0834ce88fe4e594b8e2f590m`** — flagged cover lineage.
   - **`scdf80a1900764667b3e4c3b600f79325u`** — current **secondary** slot source (preserve non-flagged image).
3. **First** remaining URL with a parseable `/kf/S…` key → **new cover supplier URL**.

## Chosen source (executed)

| Field | Value |
|--------|--------|
| **Supplier URL** | `https://ae01.alicdn.com/kf/S2eee0bfe21604c31b468ed75b002ecdc8.jpg` |
| **Object key** | `s2eee0bfe21604c31b468ed75b002ecdc8` |

## Export

- **Format:** PNG, `cover_main.png` in `artifacts/ml-image-packs/product-32690/`
- **Pipeline:** same `buildCatalogFullFrame` as `p66-rebuild-supplier-catalog-pack.ts` (rotate, flatten white, `fit: inside` on neutral square).
