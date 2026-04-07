# P70 — Flagged cover diagnosis

**Listing:** `MLC3786354420` · **Product:** `32690` · **Seller evidence:** “**Tienes errores en 1 de tus fotos**” on **PORTADA** only.

## What the cover was before P70

Per `docs/P69_TWO_REAL_IMAGE_PACK_REBUILD.md`, **`cover_main.png`** was built from supplier object **`Sd63839aaf0834ce88fe4e594b8e2f590M`** (`ae-pic-a1.aliexpress-media.com`).

## Likely ML-rejection drivers (hypothesis, catalog-policy aligned)

Mercado Libre often flags **main photo** when it reads as **marketing / non-catalog**:

1. **Busy supplier hero** — lifestyle context, props, or packaging-forward composition vs a clean “product on neutral ground” look.
2. **Readable text / labels** — box copy, SKU stickers, promo badges, or watermarks in the supplier JPEG (even small text triggers strict photo rules).
3. **Weak product protagonist** — product occupies a small fraction of the frame or competes with background clutter.
4. **Ad-like staging** — arrows, “NEW”, burst graphics, multi-panel feel (even if single raster, heavy graphic design reads as promo).

## Contrast with the non-flagged secondary (P69)

**`detail_mount_interface`** came from **`Scdf80a1900764667b3e4c3b600f79325U`** — a **different** supplier angle. Seller evidence pointed at **cover only**, consistent with **Sd63839**-line hero traits being the problem, not the second slot.

## API snapshot at replacement time (fresh signal)

Immediately before `p49` ran in P70, **`getItem`** showed:

- **`status`:** `under_review`
- **`sub_status`:** `waiting_for_patch`

That aligns with an item **pending seller correction** while the UI showed a **single photo error** on the portada.
