# P103 — Current portada failure root cause (32714)

## Source of truth

**Mercado Libre Seller Center** moderation remains authoritative. Items API success or local “approved” packs do not prove live image policy acceptance.

## Likely remaining causes (after P102)

P102 tightened **true white / near-white** metrics on the **final** portada buffer. Seller Center could still reject when:

1. **Compositing / reconstruction artifacts** — the cover still reads as edited (hard mask, halo, flat “sticker” interior) even if average border RGB looks white.
2. **Wrong source choice** — padding or whitening a **weak** primary AliExpress frame preserves collage edges, side badges, or busy structure inside the trim box.
3. **Insufficient isolation** — subject not cleanly separated from tinted studio background; residual color in the border band fails human/automated checks.

## Evidence-based conclusion

Without a live Seller Center screenshot for the **exact** rejected asset, the strongest technical hypothesis is **(1) + (2)**: the pipeline was still **optimizing the wrong bitmap** (recipe output / prior portada) instead of **ranking raw frames** and rebuilding from the cleanest product photo.

P103 addresses this by **rebuilding `cover_main` from the best-ranked raw URL** through **border-color segmentation + alpha feather + fresh 1200×1200 white canvas**, then requiring **strict + natural + hero + integrity** gates before publish.
