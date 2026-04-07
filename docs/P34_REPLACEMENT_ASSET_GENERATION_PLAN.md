# P34 Replacement Asset Generation Plan

Date: 2026-03-23

## Current outcome status

`partial`

P34 defined the exact compliant asset plan, but did not automatically generate final approved replacement files inside this sprint.

## Chosen generation strategy

Recommended approach:

- `main cover`: newly generated or manually edited clean hero image
- `detail image`: manually curated clean detail image derived from a compliant source
- `usage-context image`: optional, only if cleaned and policy-safe

Preferred production path:

1. create a new clean hero image
2. create one clean detail image
3. create one optional clean context image if it does not dilute product dominance

## Exact prompt/spec for main cover

```text
Create a MercadoLibre Chile-compliant square product hero image for a white wall-mounted cable organizer / socket organizer.
Show only the product as the protagonist.
The product must appear complete, centered, front-facing, well lit, sharp, and high quality.
Do not include any text, arrows, logos, watermarks, promotional graphics, hands, collage layout, or split composition.
Use a neutral clean background or a subtle realistic background that does not compete with the product.
Output minimum 1200x1200.
```

## Exact prompt/spec for detail image

```text
Create a clean MercadoLibre gallery detail image for the same white wall-mounted cable organizer.
Focus on the hook / mount / cable-management details.
Keep the product crisp, complete, and professional.
No text, no arrows, no logos, no watermarks, no hands, no collage composition.
Square output, minimum 1200x1200.
```

## Exact prompt/spec for optional usage-context image

```text
Create a clean MercadoLibre-safe usage-context image for a white wall-mounted cable organizer in a minimal home-office setting.
The organizer must remain the main subject and occupy the visual focus.
No text, no arrows, no logos, no watermarks, no hands, no split composition, no clutter.
Use subtle context only.
Square output, minimum 1200x1200.
```

## Approval rule before use

No generated or edited image may enter the replacement pack until a human reviewer confirms:

- the asset meets the P34 locked contract
- the asset is visually cleaner than the original supplier image
- the asset can be marked with reviewed-proof metadata

## Exact remaining blocker if automatic production is not completed

`manual_design_or_editing_step_required`

The missing piece is the actual approved replacement image file set, not the policy spec or the publishing gate.

