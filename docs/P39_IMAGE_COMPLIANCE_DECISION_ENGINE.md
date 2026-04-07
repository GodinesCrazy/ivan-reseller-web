# P39 Image Compliance Decision Engine

Date: 2026-03-23

## Goal

Formalize what the software does with risky AliExpress image inputs.

## Implemented Decision Outcomes

### `pass_as_is`

Chosen when:

- raw audit already passes
- image set is not all risky supplier raw
- image count is sufficient

Publish result:

- publish may continue using the raw image set

### `reject_hard`

Chosen when:

- no source images exist

Publish result:

- publish blocked

### `auto_remediate`

Chosen when:

- raw images need transformation, or
- raw images are supplier-risky, or
- raw images require a compliant generated pack

Implemented remediation paths:

- `internal_process_existing_images`
- `internal_generated_asset_pack`

### `manual_review_required`

Reserved for:

- image states that cannot be classified safely

## Policy Inputs Used

- no text overlays
- no arrows or graphics
- no logos or watermarks
- no risky hands / non-product domination
- no collage or split composition
- product complete and centered
- square-like
- minimum `1200x1200`
- product as protagonist

## Current Runtime Behavior For Raw Supplier Single Cover

Current raw ML audit for risky supplier single-image products remains:

- `ml_image_manual_review_required`

But the new decision engine upgrades that into:

- `decision = auto_remediate`
- `remediationPathSelected = internal_generated_asset_pack`

This means the software no longer stops at raw manual review only. It now chooses an internal remediation stage.

