# P33 Current Listing Violation Diagnosis

Date: 2026-03-23

## Classification

`clearly_non_compliant`

## Evidence used

1. Active listing identity:

- `listingId = MLC3786354420`

2. Runtime platform signal:

- public ML item fetch returned:
  - `status = 403`
  - `code = PA_UNAUTHORIZED_RESULT_FROM_POLICIES`
  - `blocked_by = PolicyAgent`

3. Published cover image inspected from MercadoLibre-hosted asset:

- `https://http2.mlstatic.com/D_727129-MLC109218309635_032026-O.jpg`

Observed image content:

- large text overlay: `100pairs`
- red arrows over the image
- split / collage-like composition
- visible human hand holding the product
- wood panel / mounting context competing with the product
- the product is not presented as the only clean subject

4. Stored listing asset state in the app:

- only `1` source image persisted
- the stored source is a raw AliExpress supplier image:
  - `https://ae-pic-a1.aliexpress-media.com/kf/Sd63839aaf0834ce88fe4e594b8e2f590M.jpg`

## Exact likely causes

### Cause 1

`non-compliant cover composition`

Why:

- the cover is not a clean single-product presentation
- the cover behaves like a supplier promo collage instead of a marketplace-safe hero image

### Cause 2

`text / overlay / promotional graphics`

Why:

- the cover visibly includes `100pairs`
- the cover visibly includes red arrows

### Cause 3

`product not isolated as protagonist`

Why:

- the hand, wall / wood element, and overlay graphics compete with the product
- the product is not shown as a clean centered hero image

### Cause 4

`single-image supplier-raw publication risk`

Why:

- only one image was published
- the image came directly from supplier media
- there was no reviewed ML-safe replacement proof

## What was not identified as the lead blocker in this sprint

- ML auth/runtime: not the blocker
- CLP / MLC publication context: not the blocker
- freight truth: not the blocker
- fee completeness: not the blocker

## P33 diagnosis conclusion

The current listing was not stopped by marketplace auth or business readiness.

It was stopped by a policy-risk cover image that violates MercadoLibre cover-photo expectations and looks like a supplier promo asset rather than a compliant marketplace hero image.

