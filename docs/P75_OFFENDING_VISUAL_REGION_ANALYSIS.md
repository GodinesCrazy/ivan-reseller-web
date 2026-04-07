# P75 — Offending visual region analysis (32690 / MLC3786354420)

## Sources inspected

- **Supplier hero (pre-cleanup):** `https://ae01.alicdn.com/kf/S2eee0bfe21604c31b468ed75b002ecdc8.jpg` (object key `s2eee0bfe21604c31b468ed75b002ecdc8`).
- **P74 built cover:** `artifacts/ml-image-packs/product-32690/cover_main.png` — center-crop + white canvas **kept** AliExpress **measurement overlays** and **bottom color callout** inside the retained region.
- **P75 built cover (final):** same path, rebuilt with listing-scoped **annotation insets** (see `P75_TRUE_CLEANUP_PIPELINE.md`).

## Seller reasons (active truth)

1. **“Contiene logos y/o textos.”**
2. **“No tiene fondo claro o con textura.”**

## Exact contamination (supplier + P74 failure mode)

| Trait | Type | Location in frame | Why P74 failed |
|--------|------|-------------------|----------------|
| **“9.7cm” + vertical dimension line** | Graphic overlay (not part of plastic SKU) | Left rail, beside product | Center-crop (0.64) still included this band. |
| **“3.5cm” + horizontal dimension line** | Graphic overlay | Top band | Same: crop kept top annotation zone. |
| **“orange” (color callout wordmark)** | Graphic overlay | Bottom band | Same: crop kept bottom marketing strip. |
| **Soft drop shadow / neutral gradients** | Scene / post tone | Around product edges | Reads as non-plain “texture” to ML when combined with busy composition. |

## Printed-on-product risk

The **plastic body** in the cleaned region does not show a separate brand mark in visual review; the **dominant** text/logo signals were **overlaid graphics** in the supplier JPEG, addressable by **removing bands** (insets), not by white canvas alone.

## Background interpretation

- **Literal white:** achievable with flat `#ffffff` canvas.
- **“Textura” flag:** likely driven by **shadows**, **JPEG edges**, and **non-catalog dimension graphics** in the same frame as the product.

## Conclusion

P74’s **crop-only + tonal** path could not satisfy ML because **text/logo lived inside the kept rectangle**. P75 must **excise annotation regions** explicitly (listing-scoped inset crop), then normalize background (neutral shadow crush) on pure white.
