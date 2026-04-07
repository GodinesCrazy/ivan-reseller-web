# P73 — Fallback if clean cover still fails

## If live P73 cover **still** triggers the **same** two reasons

1. **Stronger crop** — increase `CENTER_KEEP` toward **0.64** in `p73-build-clean-catalog-cover.ts` (more edge stripped; smaller protagonist — tradeoff).
2. **Different source** — force **second-ranked** center-mean key (**`sd8adf1f1…`**) by extending the script with `--force-source-key=<key>` (not implemented in P73 baseline).
3. **Manual retouch** — Photoshop/Figma: **mask product**, place on **#FFFFFF** flat field, export 1536² PNG, upload via seller UI or replace local `cover_main.png` then `p49`.
4. **ML seller support** — attach **exact** tooltip text, before/after images, and list of automated steps (center crop 72%, flat `rgb(248,249,250)`).

## If warning **moves** to secondary

Re-open **detail** path only with evidence; until then **do not** change `detail_mount_interface.png`.

## If token blocks publish (P73 actual)

**Fallback is credential repair**, not another cover variant — fix ML OAuth, run **`p49`**.
