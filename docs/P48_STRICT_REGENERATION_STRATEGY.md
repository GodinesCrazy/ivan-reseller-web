# P48 Strict Regeneration Strategy

## Goal
Replace the weak source-preserving self-hosted transform with a stricter MercadoLibre-safe regeneration strategy.

## Strategy change
- `cover_main`
  - changed from weak supplier-image transform to fresh clean studio-style hero render
  - required product-only protagonist framing
  - explicitly disallowed text, arrows, hands, promo graphics, collage, and split composition
- `detail_mount_interface`
  - changed from contaminated crop to fresh clean detail-oriented render that still keeps the full product identifiable
  - required centered composition and clean focus on the mount/interface
  - explicitly disallowed text, arrows, hands, promo graphics, collage, and split composition

## Prompt/spec change
- prompt package now explicitly requires:
  - fresh clean studio-style render
  - composition reset instead of supplier-source preservation
  - removal or avoidance of `100pairs`-style copy, arrows, hands, and promo graphics
  - centered product protagonism

## Provider behavior change
- for product-family prompts matching wall / cable / organizer patterns, the self-hosted provider now uses:
  - `prompt_guided_clean_render`
- generic fallback remains available as:
  - `generic_clean_crop`

## Why this is stricter
- it no longer trusts the supplier image composition
- it no longer tries to salvage the contaminated split layout
- it produces clean ML-safe assets designed to satisfy the locked review checklist directly
