# P0 Webhook Gate Hardening

Date: 2026-03-20

## Problem fixed

Before P0, configured/authenticated connectors could still look too healthy even when event ingestion was not ready.  
That created false automation truth.

## Hardening implemented

Connector readiness now models:

- `configured`
- `authenticated`
- `operationalApiReachable`
- `webhookReady`
- `eventFlowReady`
- `automationReady`
- `operationMode`

`operationMode` now resolves to one of:
- `automation_ready`
- `manual_or_polling_partial`
- `blocked`

## Backend changes

- added `backend/src/services/webhook-readiness.service.ts`
- `setup-status` now exposes connector readiness breakdown
- `readiness-report` now consumes connector readiness for autonomous gating
- phase-28 autopilot validation now incorporates webhook/event readiness

## Real validation

Local authenticated `GET /api/setup-status` returned:

- `setupRequired = true`
- `automationReadyMarketplaceCount = 0`
- `ebay.operationalApiReachable = true`
- `ebay.webhookReady = false`
- `ebay.eventFlowReady = false`
- `ebay.operationMode = manual_or_polling_partial`
- `mercadolibre.operationalApiReachable = true`
- `mercadolibre.webhookReady = false`
- `mercadolibre.eventFlowReady = false`
- `mercadolibre.operationMode = manual_or_polling_partial`
- `amazon.operationMode = blocked`

This is the desired P0 truth:
- eBay and MercadoLibre are no longer allowed to masquerade as automation-ready
- Amazon remains clearly blocked

## Operational impact

### Removed false truth

- “configured = operational”
- “API reachable = automation ready”
- “autopilot can be enabled because connectors exist”

### New truthful semantics

- API reachability without webhooks = partial/manual only
- automation readiness requires event-flow readiness
- missing webhooks block green automation claims

## Remaining blockers

- real webhook configuration is still absent for:
  - eBay
  - MercadoLibre
  - Amazon
- event-driven automation is still blocked until real marketplace-side webhook registration is completed
