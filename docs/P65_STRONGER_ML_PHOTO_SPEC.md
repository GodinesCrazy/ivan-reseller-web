# P65 — Stronger MercadoLibre photo spec (listing 32690)

Applies to **`cover_main`** and **`detail_mount_interface`** for this controlled listing only.

## Principles

1. **Authentic supplier raster** as the **dominant** pixel source (no SVG product illustration for this SKU family in this sprint).
2. **Catalog clarity:** product occupies **most** of the frame (target up to **1320px** inside **1536×1536** square).
3. **Neutral studio background:** flat **#f0f2f5** RGB(240,242,245) canvas — separates listing chrome from ML white UI without fake gradients.
4. **Trust signals:** visible **material edges**, **real shadows/highlights** from the supplier shot (not vector fills).
5. **Detail shot:** **center crop ~55%** of the primary supplier image when only **one** URL exists (simulates mount/interface close-up); with **two** URLs, detail uses **second** image with **72%** center crop.
6. **Light enhancement only:** mild **sharpen**, **saturation +8–10%**, **brightness +2–3%** — no text, logos, arrows, watermarks, collages, or hands.

## `cover_main`

- Full supplier frame, **fit inside** 1320×1320, centered on 1536 canvas.
- **Protagonist:** entire sellable unit visible where possible.

## `detail_mount_interface`

- **Closer** framing for hooks/mount/interface legibility.
- Same canvas and enhancement rules as cover.

## Explicit exclusions (ML-safe)

- No promotional badges, no “NEW”, no price, no AliExpress marks added in post (supplier JPEG may contain marketplace marks from source — accepted as supplier truth).

## Output contract

- **1536×1536** PNG, **≥1200** side (satisfied), square for `inspectMercadoLibreAssetPack`.
