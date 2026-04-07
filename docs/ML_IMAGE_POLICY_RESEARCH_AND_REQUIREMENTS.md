# ML Image Policy Research and Requirements

> Compiled: 2026-04-02 | Scope: Mercado Libre Chile (MLC) | Marketplace: Listings in all general categories

---

## Executive Summary

Mercado Libre Chile enforces a mandatory set of image requirements on every product listing. The cover image (portada, position 1) is the most regulated: it must have a digitally-created **pure white background (#FFFFFF)**, show a **single product unit** fully visible and centred, and contain **no overlays** (text, logo, watermark, stickers, QR codes, promotional banners). Images that fail these checks receive the `poor_quality_thumbnail` moderation tag, which causes **demotion in search rankings or outright listing pause**. The average documented revenue impact of non-compliant thumbnails is **15–30% lower sales**.

---

## Part 1 — Confirmed Official Rules

These rules are explicitly documented in MercadoLibre's official developer API, seller center (vendedores.mercadolibre.cl), and global-selling documentation.

### 1.1 Technical Specifications

| Parameter | Required Value | Notes |
|---|---|---|
| Minimum dimensions | 500 × 500 px | Hard API limit. Images below this are rejected at upload. |
| Recommended dimensions (general) | **1200 × 1200 px** | Standard for all non-fashion categories |
| Recommended dimensions (fashion) | 1200 × 1540 px | Vertical ratio for garments |
| Zoom activation | Width > 800 px | Enables the zoom widget on listing page |
| Maximum processed | 1920 × 1920 px | Larger images are auto-downscaled by API |
| Maximum file size | 10 MB | Hard upload limit |
| Practical minimum file size | ~600 KB | Platform quality expectation (not a hard error) |
| Accepted formats | JPG, JPEG, PNG | GIF technically accepted but not recommended |
| Colour space | RGB | CMYK is not supported |
| Aspect ratio (cover) | Square 1:1 | Strongly preferred for all general categories |

### 1.2 Cover Image (Portada) — Absolute Rules

1. **White background**: Must be a **digitally-created pure white background (#FFFFFF)**. A product photographed in front of a white wall does not qualify because it creates soft shadows. The background must be absolute white with no off-white tint, no shadows cast onto the background, and no gradients.

2. **Single product**: Position-1 image must show exactly one product unit. Multiple units in one frame trigger the `multiproduct` automatic moderation flag.

3. **No overlays of any kind**: Zero tolerance for logos, watermarks, text of any kind (including pricing, promotional copy, "new", "sale"), borders or frames, QR codes, contact details (phone, email, website, social handles), promotional banners, badge graphics, stickers.

4. **Product visible outside packaging**: The cover must show the bare product, not the retail packaging or box. Exception: packs/kits sold as a set.

5. **Product fully visible**: No part of the product may be cropped or touching the image edge.

6. **Product centred**: Horizontally and vertically centred within the canvas.

7. **Product coverage**: Official canonical figure is **~95% of frame** for general categories. Conservative practical target: **75–90%** (leaves visible white margin to avoid background bleed artifacts at edges).

### 1.3 Gallery Images (positions 2–10)

- Maximum: **10 images** per variant (min 8 recommended).
- Same overlay prohibitions apply: no logos, no text, no watermarks.
- No contact information in any image at any position.
- Allowed in secondary images: lifestyle/context shots, packaging, detail close-ups, dimension diagrams, colour variant shots, certification marks that are integral to the product.
- Images must be original; do not scrape from manufacturer URLs without verified rights.

### 1.4 Automated Moderation System (ML Internal Checks)

ML's AI moderation pipeline (confirmed by developer API image-diagnostics endpoint and public case studies) runs these named checks on the cover image:

| Check Name | What It Evaluates |
|---|---|
| `white_background` | Digitally-created pure white background on position-1 |
| `minimum_size` | Image meets minimum pixel dimensions |
| `logo_text_watermark` | Presence of logos, text, watermarks, banners |
| `unprofessional_photo` | Composite: multi-product, background issues, overlays |
| `blur` | Image is sharp/in-focus |
| `multiproduct` | More than one product unit visible in position-1 |

Consequence: failing any of these tags the listing with `poor_quality_thumbnail`, reducing search position or pausing the listing.

---

## Part 2 — Operational Rules (Inferred from Observed Behaviour)

These are not explicitly documented but are consistently observed across seller community reports and ML API behaviour:

1. **Gray backgrounds fail `white_background`**: Any background that is not pure or near-pure white (#F5F5F5 and above is marginal; #DCDCDC and darker will fail). Studio gray (#dcdcdc = 220,220,220) is explicitly rejected.

2. **Soft/photographed shadows on the background field trigger `white_background` failure**: Even if the background is nominally white, visible soft shadows on the background plane cause the moderation check to fail.

3. **Border and corner regions are weighted heavily**: The `white_background` moderation appears to weight the perimeter and corners heavily. Images where corners are non-white (residual background colour, halos) fail even if the centre field is white.

4. **Halo artefacts around isolated products trigger `unprofessional_photo`**: Imperfect background-removal that leaves a coloured fringe around the product silhouette causes the unprofessional photo flag.

5. **Slightly off-white near-white products can vanish into white background**: Images where the product itself is very light-coloured and indistinguishable from the white background may trigger both `unprofessional_photo` (product not visible) and `blur` (no detail visible).

6. **Product below 35% of canvas area is frequently flagged**: Consistently reported; product appearing tiny in the frame triggers `unprofessional_photo`.

7. **Category-specific background rule for fashion accessories**: Fashion accessories and apparel use the `picture-certifier` moderation system (separate from `poor_quality_thumbnail`). For accessories, a real neutral-tone surface background (light gray, cream) may outperform digital pure white due to differences in how that system evaluates "professional quality".

---

## Part 3 — Conservative Internal Rules

These rules are applied by this software's validation pipeline to reduce rejection risk beyond the documented minimums:

| Rule | Threshold | Reason |
|---|---|---|
| Near-white pixel dominance | ≥ 62% of all pixels | Ensures background is clearly white, not gray |
| Pure-white pixel dominance | ≥ 40% of all pixels | Gray (#dcdcdc) produces 0% pure-white; this definitively catches it |
| Border near-white ratio | ≥ 90% of border pixels | Perimeter is the first thing ML's check evaluates |
| Corner near-white ratio | ≥ 93% of corner pixels | Corners are directly sampled in ML's internal check |
| Border luma mean | ≥ 246 | Values below 246 indicate a gray cast |
| Border luma std dev | ≤ 13 | High std dev = non-uniform border = shadows or objects at edge |
| Product area | 35–91% of canvas | Keeps product visible without touching edges |
| Product centering | ≤ 20% offset from canvas centre | Ensures visually balanced composition |
| Laplacian variance | ≥ 80 | Below this = blurry image |
| Product near-white fraction | ≤ 92% of subject area | Above this = product invisible / washed out |
| Output resolution | ≥ 1200 × 1200 px | Well above ML minimum, activates zoom |
| Output format | JPEG | Maximum compatibility; PNG accepted but JPEG preferred for file size |
| JPEG quality | 90–92 | High enough for zoom quality, not bloated |

---

## Part 4 — What Must Be Rejected (Rejection Catalogue)

The following image characteristics must prevent a cover from being published:

| Category | Signal | Internal Code |
|---|---|---|
| Background | Gray, off-white, coloured, textured, photographed-white | `white_bg_*` |
| Background | Shadows cast onto background plane | `white_bg_border_shadow_or_object_bleed` |
| Text | Any visible text, pricing, copy, labels not on the product | `text_logo_top_*`, `text_logo_*_promo_or_text` |
| Logo | Seller logo, brand logo not integral to product | `text_logo_*_graphic_risk` |
| Watermark | Any watermark at any opacity | `text_logo_*` |
| Sticker | Promotional badge, "new" flag, discount badge | `text_logo_high_contrast_block_fragmentation_*` |
| QR code | Any barcode or QR | URL-based heuristic in policy service |
| Border | Decorative frame around the image | `portada_frame_edges_dominate_core_ui_or_banner_framing` |
| Collage | Multiple product images in a grid | `portada_vertical_split_seam_collage_risk` |
| Packaging | Product shown inside box/retail packaging | (human review required for this; no automated signal) |
| Composition | Product too small (< 35% canvas area) | `composition_subject_area_*_product_too_small` |
| Composition | Product has no margin (> 91% canvas area) | `composition_subject_area_*_no_margin` |
| Composition | Product off-centre (> 20% offset) | `composition_centre_offset_*_not_centred` |
| Composition | Product cropped at edge | `composition_product_touches_or_crops_at_edge` |
| Quality | Blurry / out of focus | `sharpness_laplacian_variance_*_image_blurry` |
| Quality | Product washed out / over-exposed | `over_exposure_product_*_washed_out` |
| Multi-product | Multiple separate units visible | `multi_product_*_separating_gaps_detected` |
| Halo | Coloured fringe around isolated product | `portada_natural_look_colored_halo_or_tint_in_white_border` |

---

## Sources

- MercadoLibre Chile Seller Center: vendedores.mercadolibre.cl
- MercadoLibre Global Selling: global-selling.mercadolibre.com/help/take-good-pictures_805
- MercadoLibre Developer API (Pictures, Image Diagnostics, Image Moderation): developers.mercadolibre.com.ar
- MercadoLibre Developer — Fashion Photo Quality: developers.mercadolibre.com.mx/en_us/fashion-photo-quality
- Vue.ai — MercadoLibre Automated Image Moderation Case Study: vue.ai
- Real Trends, Algoritmo Digital, Multivende (third-party ML-certified agency documentation)
