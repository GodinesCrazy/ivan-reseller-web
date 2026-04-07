# P40 Optimizer Non-Blocking Integration

## Integration Rule
- optimizer runs in advisory mode
- optimizer does not block ML Chile reactivation
- existing strict publish blockers remain in control

## Implemented Integration
- pre-publish path now computes `marketplaceOptimizationAdvisory` for MercadoLibre candidates
- diagnostic script added:
  - `backend/scripts/check-marketplace-optimization-agent.ts`

## Immediate Benefit
- the software can now explain why a listing is healthy or weak even before post-publication metrics exist
