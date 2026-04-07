# P37 Real Asset Production Package

Date: 2026-03-23
Listing: `MLC3786354420`
Product: `32690`

## Objective

Produce the final ready-to-use generation/editing package for the actual image files.

## Result

Status: `DONE`

The repo still cannot generate trustworthy final compliant product images directly, so P37 delivers the external production package required for immediate manual image creation with zero ambiguity.

Package files created in:

- `C:\Ivan_Reseller_Web\artifacts\mlc3786354420`

Supporting package files:

- `README_P37_ASSET_PACK.txt`
- `cover_main.prompt.txt`
- `detail_mount_interface.prompt.txt`
- `usage_context_clean.prompt.txt`

## Required Asset 1 — `cover_main`

Purpose:

- primary MercadoLibre replacement cover

Exact prompt/spec:

```text
Create a MercadoLibre Chile-compliant square product hero image for a white wall-mounted cable organizer / socket organizer.
Show only the product as the protagonist.
The product must be complete, centered, front-facing, well lit, sharp, and visually clean.
Use a neutral clean background or a subtle non-distracting background.
Do not include any text, arrows, logos, watermarks, promotional badges, visible hands, collage layout, split composition, or distracting props.
Output minimum 1200x1200.
```

Do-not-include list:

- text
- arrows
- logos
- watermarks
- promotional badges
- visible hands
- collage layout
- split composition
- busy props

Framing/composition:

- square or near-square
- centered
- clean hero framing
- product must dominate the image

Size requirement:

- minimum `1200x1200`

Approval criteria:

- product complete
- centered
- protagonist
- no banned visual traits
- visually cleaner than original supplier image

## Required Asset 2 — `detail_mount_interface`

Purpose:

- supporting gallery detail image for hook, mount, and cable-management features

Exact prompt/spec:

```text
Create a clean MercadoLibre gallery detail image for the same white wall-mounted cable organizer.
Focus on the hook, mount, and cable-management details while keeping the product complete and professional.
Use a clean, simple composition with the product clearly visible and dominant.
No text, no arrows, no logos, no watermarks, no hands, no collage or split composition.
Square output, minimum 1200x1200.
```

Do-not-include list:

- text
- arrows
- logos
- watermarks
- hand interaction
- split layout
- collage layout

Framing/composition:

- square or near-square
- detail-focused but still product-readable
- clean composition

Size requirement:

- minimum `1200x1200`

Approval criteria:

- detail is clear and useful
- product remains identifiable and clean
- no banned traits
- visually cleaner than original supplier image

## Optional Asset — `usage_context_clean`

Purpose:

- optional lifestyle/context gallery image only if product dominance remains obvious

Exact prompt/spec:

```text
Create a clean MercadoLibre-safe usage-context image for a white wall-mounted cable organizer in a minimal home-office environment.
The organizer must remain the main visual subject and appear complete, centered enough for clear recognition, and well lit.
Use only subtle realistic context.
Do not include text, arrows, logos, watermarks, visible hands, collage layout, split composition, or clutter.
Square output, minimum 1200x1200.
```

## Exact External Production Rule

If images are generated or edited outside the repo, the operator should create them from the prompt files above, export them into the locked filenames, and place them into:

- `C:\Ivan_Reseller_Web\artifacts\mlc3786354420`

