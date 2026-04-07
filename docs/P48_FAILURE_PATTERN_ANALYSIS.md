# P48 Failure Pattern Analysis

## Goal
Translate the P47 rejection into concrete regeneration targets for the self-hosted MercadoLibre asset pipeline.

## P47 rejection truth
- `cover_main` and `detail_mount_interface` both failed honest native review.
- Retained supplier-bad traits were:
  - visible text `100pairs`
  - red directional arrows
  - visible hand
  - split / non-protagonist composition
  - output not visually cleaner than the supplier source

## Failure-mode mapping
- `no_text=false`
  - failure mode: source-preserving transform kept supplier promotional copy
- `no_hand=false`
  - failure mode: crop/resize path preserved the right-side hand from the source image
- `no_collage_split=false`
  - failure mode: transform preserved the original left-panel / right-product supplier layout
- `product_protagonist=false`
  - failure mode: product remained only one part of a contaminated composition instead of the sole subject
- `centered_or_compositionally_clear=false`
  - failure mode: crop strategy did not reset framing around the product
- `visually_cleaner_than_supplier=false`
  - failure mode: output was effectively a resized supplier image rather than a decontaminated publication asset

## Root-cause classification
- previous self-hosted strategy was too close to source
- previous strategy was insufficiently transformative
- previous strategy was weak on composition reset
- previous strategy was weak on text / graphic suppression
- previous strategy was weak on isolating the product from supplier props and hand presence

## Regeneration targets
- eliminate all text inheritance
- eliminate all arrow / promo graphic inheritance
- eliminate all visible hand inheritance
- eliminate split-layout inheritance
- rebuild framing around a single centered product protagonist
- produce output that is clearly cleaner than the supplier source on direct visual comparison
