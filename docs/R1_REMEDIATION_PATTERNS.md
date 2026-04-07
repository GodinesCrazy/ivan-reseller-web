# R1 — Remediation patterns

## Taxonomy of remediation (what vendors actually offer)

| Technique | Who documents it | Compliance note |
|-----------|------------------|-----------------|
| **Padding / resize to channel spec** | Feedonomics | Fixes **geometry**, not **content** |
| **Template compositing** (image + text + shapes + logos) | Feedonomics, Channable | Can **improve ads**; can **violate** “no text on main image” rules if misapplied |
| **Per-channel alternate photo** | Sellercloud | **Safest** when you have **two masters** (studio white vs lifestyle) |
| **DAM transforms** (resize, autocrop, **background removal**) | Akeneo Asset Manager / Smart Edit | Strong **industrial** pattern; edition limits for AI features |
| **AI image generation** | Helium 10 (Listing Builder) | **New pixels** — legal/trust risk; policy varies by marketplace |
| **Reject / fail feed** | Channable — feed fails on image editor errors | **Fail closed** |
| **Human + services** | Feedonomics “full-service team” | **Scale** via people for edge cases |

## What top systems generally do **not** promise (R1)

- Guaranteed **OCR-driven** removal of supplier dimension overlays without crop or inpaint — **NOT PROVEN** as standard SKU feature in reviewed suites.
- Universal **“remove hands”** automation — **NOT PROVEN**.

## Inferred industry composite (common in integrations)

Many merchants chain:

`supplier URL` → **remove.bg / Photoroom / internal sharp** → **white pad** → **CDN host** → **feed field**

This is **architecture pattern** seen in integrator blogs and API marketing; **not** a single vendor’s end-to-end documented suite in R1.

## Best-practice ordering of remediation stages (synthesized)

1. **Cheap checks** (dimensions, format, file size, HTTPS).
2. **Non-destructive** mechanical (rotate EXIF, pad, resize).
3. **Destructive content** (crop bands, background replace) — **only** with **policy template** allowing it.
4. **AI** — **optional branch** with **confidence + human gate** for regulated marketplaces.
5. **Reject or alternate source** if irreducible.

## Evidence vs inference summary

- **Evidence:** Feedonomics padding/templates; Channable rule-based editor + failures; Sellercloud alternate images; Akeneo transforms/AI BG.
- **Inference:** Hand-off to **specialist CV APIs** is common **outside** what feed docs describe.
