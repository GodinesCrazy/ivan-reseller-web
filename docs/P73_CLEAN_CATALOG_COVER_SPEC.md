# P73 — Clean catalog cover spec

## Hard requirements (from seller copy)

- **No visible marketing text** (best-effort: crop + no added text in pipeline).
- **No logos** (same — edge crop reduces corner marks; on-product print may remain).
- **Light, plain background** — **no** wood grain, fabric, or busy environment in the **exported** cover.
- **Product protagonist** — centered, scaled with `fit: inside` max **1280** on **1536×1536** canvas.
- **No hands / collage** — inherited from supplier selection (single-frame crop only).

## Source selection

- All distinct supplier keys **except** secondary slot key **`scdf80a…`**.
- **Pick** the URL whose **center 72%** region has the **highest mean RGB** (prefers naturally lighter central field → often less dark lifestyle clutter).

## Export

- **PNG** `cover_main.png`
- **Background:** `#f8f9fa` equivalent `rgb(248,249,250)` — uniform, no texture.
- **Secondary:** `detail_mount_interface.png` **unchanged**.

## Script

`backend/scripts/p73-build-clean-catalog-cover.ts`
