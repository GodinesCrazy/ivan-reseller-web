# P33 Publishing Agent Compliance Spec

Date: 2026-03-23

## Goal

Prevent future MercadoLibre Chile publications from repeating the image-policy failure seen on `MLC3786354420`.

## New compliance statuses

- `ml_image_policy_pass`
- `ml_image_policy_fail`
- `ml_image_manual_review_required`

## Canonical MLC image-policy contract

A MercadoLibre Chile publication may proceed only when the primary cover satisfies this contract:

- cover shows the product as the clear protagonist
- product is complete and centered
- no text, arrows, logos, or watermarks
- no promotional banners or marketplace-style badges
- no collage / split composition
- no risky supplier-raw cover without reviewed approval
- primary image is high-resolution and square-like

## Agent-side decision model

### Hard fail

The publisher must stop before publication when any of these are true:

- cover image missing
- primary image below the minimum `1200 x 1200` contract
- primary image not square-like
- primary image URL or evidence contains watermark / text / banner risk markers
- explicit visual signal indicates:
  - `text_overlay_detected`
  - `logo_or_watermark_detected`
  - `product_incomplete_or_uncentered`
  - `background_not_policy_safe`
  - `collage_or_split_composition_detected`
  - `hands_or_non_product_objects_dominate_cover`

### Manual review required

The publisher must stop before publication and require human remediation when:

- all images are raw supplier images
- there is only one cover image
- there is no reviewed ML-safe image proof recorded
- image metadata cannot be measured and no reviewed proof exists

### Pass

Publication may continue only when:

- no hard blockers exist
- no manual review reasons remain
- a reviewed ML-safe image proof exists when supplier-risk conditions would otherwise block

## Reviewed-proof model

The code now supports a reviewed-proof structure in product metadata:

- `mlChileImageCompliance.status`
- `mlChileImageCompliance.reviewedAt`
- `mlChileImageCompliance.reviewedBy`
- `mlChileImageCompliance.assetSource`
- `mlChileImageCompliance.primaryImageUrl`
- optional `mlChileImageCompliance.visualSignals`

Accepted reviewed asset sources:

- `manual_replacement`
- `clean_local_asset`
- `internal_generated`

## Publish-safety rule

For `mercadolibre` publish attempts, image policy is now part of the strict preventive gate, not an optional heuristic.

If the image contract is not satisfied, publication must fail closed before MercadoLibre listing creation.

