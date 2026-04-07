# P73 — Rejection reason mapping

**Seller tooltips (PORTADA):**

1. **"Contiene logos y/o textos."**
2. **"No tiene fondo claro o con textura."**

## Likely visual sources (prior covers)

| Issue | Typical source in supplier → pack pipeline |
|--------|---------------------------------------------|
| **Logos / text** | Packaging edges, corner badges, AliExpress/seller watermarks, SKU stickers, promo graphics baked into JPEG. |
| **Non-light / textured background** | Lifestyle shots (wood desk, fabric, colored walls), gradient backdrops, busy environmental context. |

## Corrective mapping (P73 build)

| Seller requirement | P73 technical response |
|--------------------|-------------------------|
| Reduce logos/text at **frame edges** | **Center crop** — keep **72%** of width/height from image center (drops many edge labels before resize). |
| Light **plain** background | **Flat catalog canvas** — solid **`rgb(248,249,250)`** behind product (no wood/texture in the **final** tile). |
| Catalog-like product presentation | **Flatten** on white before resize; **slightly lower saturation** (0.88) + **brightness lift** (1.06); **mild sharpen** (0.45) vs heavier “ad” sharpening. |
| Real product truth | Source remains a **real AliExpress supplier URL**; we do **not** invent a different product. |

## Limitation (honest)

**Text or logos printed on the product body** (center of frame) **cannot** be removed without inpainting / manual retouch. P73 mitigates **edge** contamination and **global** background read.
