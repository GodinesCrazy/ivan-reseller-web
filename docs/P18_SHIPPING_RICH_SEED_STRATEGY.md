# P18 Shipping-Rich Seed Strategy

## Goal
Prioritize supplier patterns that are more likely to expose shipping method and shipping-cost truth for Chile before optimizing for the previous low-risk organizer profile.

## Implemented strategy
The ML Chile seed strategy was changed in:
- `backend/src/utils/ml-chile-seed-strategy.ts`

New query families:
- `sticker pack`
- `washi tape`
- `bookmark magnetic`
- `keychain charm`
- `hair clip`
- `embroidery patch`
- `nail sticker`
- `phone lanyard`

## Priority logic
1. Chile support
2. CL-buyable SKU truth
3. shipping-method / shipping-cost richness
4. then lower breakage / lower return risk / lower variant complexity

## Safety logic preserved
- no batteries
- no glass / fragile-first bias
- no brand optimism
- no fabricated shipping cost
- no soft publish path

## P18 verdict on the new strategy
The strategy materially improved funnel exploration breadth and CL coverage, but it still did not produce a shipping-rich candidate.

That means the next iteration should not simply add more random families. It should target supplier patterns explicitly correlated with richer logistics payloads for Chile.
