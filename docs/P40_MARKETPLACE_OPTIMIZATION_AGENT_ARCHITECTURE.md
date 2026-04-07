# P40 Marketplace Optimization Agent Architecture

## Native Component
- New advisory service: `backend/src/services/marketplace-optimization-agent.service.ts`

## Flow
product snapshot -> signal extraction -> marketplace scores -> advisory state -> recommendations -> diagnostics / metadata integration

## States
- `healthy`
- `needs_compliance_attention`
- `needs_content_improvement`
- `needs_pricing_review`

## Outputs
- score bundle
- recommendation list
- observed signals snapshot
- controlled levers list

## Reusability
- cross-marketplace friendly core
- MercadoLibre Chile is the first grounded adapter
