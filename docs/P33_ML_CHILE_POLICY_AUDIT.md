# P33 ML Chile Policy Audit

Date: 2026-03-23

## Scope

Active listing under audit:

- `productId = 32690`
- `listingId = MLC3786354420`
- marketplace = `MercadoLibre Chile / MLC / CLP / es`

Primary sources used:

- https://vendedores.mercadolibre.cl/nota/las-fotos-son-la-cara-de-tu-negocio-lucite-en-ellas?guideKeyId=GE31&moduleKeyId=MO232
- https://vendedores.mercadolibre.cl/nota/requisitos-de-fotos-para-sillones?suScope=prod
- https://vendedores.mercadolibre.cl/nota/requisitos-de-fotos-para-vender-accesorios
- https://vendedores.mercadolibre.cl/nota/como-publicar-sin-infringir-propiedad-intelectual?guideKeyId=GE31

## Policy rules relevant to this listing

### 1. Main photo / cover photo

Classification: `hard blocker`

Relevant rules from MercadoLibre seller guidance:

- the cover image is the most important image and may expose the listing to pause risk if it does not comply
- the product must be the protagonist
- the product must be complete, centered, and clearly visible
- the image should avoid margins and use a square or near-square frame
- the image should be sharp and high quality

### 2. Additional gallery images

Classification: `quality requirement`

Relevant rules:

- MercadoLibre recommends more than one image
- gallery images should show useful details without distracting elements
- multiple images improve buyer clarity and listing performance

### 3. Text / logos / watermarks

Classification: `hard blocker`

Relevant rules:

- do not add watermarks
- do not add promotional banners or platform tags
- do not overlay text, signatures, logos, or marketplace-only badges on the image

### 4. Background / composition / centering

Classification: `hard blocker` for distracting cover composition, `category-specific requirement` for style

Relevant rules:

- the product must be centered and complete
- the cover must avoid excessive background elements that compete with the product
- for home / furniture style listings, MercadoLibre seller guidance allows professional in-context photos, but the product still must remain the main subject
- product-obscuring objects, clutter, or collage-style composition are unsafe

### 5. Resolution and size

Classification: `hard blocker`

Relevant rules:

- the image should be square or proportionally similar
- the minimum recommended resolution is `1200 x 1200`
- low-quality or blurry images reduce visibility and may cause policy or quality issues

### 6. Category-specific rules

Classification: `category-specific requirement`

The published item resolved to:

- `domain_id = MLC-CABLE_ORGANIZERS`

The closest relevant MercadoLibre seller guidance found in this sprint is the `hogar y muebles` photo guidance:

- home-oriented products may use professional context photos
- even in context, the product must remain complete, centered, well lit, and clearly dominant

No additional restricted-category rule specific to `cable organizers` was found in the official ML Chile help pages loaded in this sprint.

### 7. Misleading content / publication seriousness

Classification: `hard blocker`

Relevant rules:

- photos must represent the actual product clearly and seriously
- banners, exaggerated overlays, or misleading composition that changes what the buyer perceives are unsafe
- listing quality affects visibility and trust

### 8. Intellectual property / brand misuse

Classification: `hard blocker`

Relevant rules from MercadoLibre IP guidance:

- do not offer counterfeit, replica, imitation, or infringing content
- rights-holder complaints can pause or cancel listings
- repeated or severe IP violations can cause selling restrictions or suspension

### 9. Seller-side policy signals that can pause or demote listings

Classification: `hard blocker` or `quality requirement`, depending on the signal

Relevant seller-side signals:

- non-compliant cover images can cause listing pause risk
- poor-quality images hurt positioning in results
- policy-detected violations can trigger publication cancellation, pausing, or additional account restrictions

## P33 policy conclusion

For this ML Chile listing, the non-negotiable publication contract is:

- clean cover image
- product only as protagonist
- complete and centered product
- no text / logo / watermark / arrows / promotional overlays
- square high-resolution cover
- no supplier-raw collage or risky marketplace-unsafe composition

That contract must become a hard pre-publication gate for future MLC listings.

