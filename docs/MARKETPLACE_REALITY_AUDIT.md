# Marketplace Reality Audit

Date: 2026-03-20

## Method

This document evaluates each marketplace independently.  
It does not merge configured, authenticated, operational, and event-ready into one generic status.

## eBay

### Current evidence

- Same-day live earlier:
  - eBay connection test succeeded.
  - eBay orders endpoint succeeded.
  - Real order sync fetched a real order and skipped duplicate insertion because it already existed.
- Current live now:
  - direct internal eBay test route requires secret and cannot be called anonymously.
- Current code:
  - eBay webhook route exists.
  - eBay country mapping exists, but currency handling for non-US regions is incomplete.

### Readiness table

| Capability | State |
|---|---|
| Configured | Yes |
| Authenticated | Yes |
| Operational API connectivity | Yes |
| Listings readable | Partial |
| Orders readable | Yes |
| Publish flow safe under new engine | Not yet proven |
| Webhook secret configured | No |
| Event ingestion ready | Partial |
| Auto fulfillment handoff | Partial |
| Country-aware support | Partial |
| Language-aware support | Partial |
| Currency-aware support | Partial / weak outside US/UK |
| Fee model support | Partial |

### Real blocker summary

- eBay is the most operational marketplace right now.
- Even so, it is still not controlled-sale ready because:
  - webhooks are not configured,
  - live active listings are not proven,
  - supplier-safe validated product path has not yielded a winner.

## MercadoLibre

### Current evidence

- Same-day production setup showed MercadoLibre configured/connected at system level.
- Current safe engine explicitly validates MercadoLibre Chile context.
- Current live webhook status shows MercadoLibre webhook secret not configured.
- No validated ready product has yet passed MercadoLibre Chile strict validation.

### Readiness table

| Capability | State |
|---|---|
| Configured | Yes |
| Authenticated | Historically yes / current protected re-check unavailable |
| Operational API connectivity | Partial |
| Listings readable | Partial |
| Orders readable | Partial |
| Publish flow safe under new engine | Architecturally yes, commercially no validated product yet |
| Webhook secret configured | No |
| Event ingestion ready | No |
| Auto fulfillment handoff | Not proven |
| Country-aware support | Yes for Chile in new path |
| Language-aware support | Partial |
| Currency-aware support | Partial |
| Fee model support | Partial and simplified |

### Real blocker summary

- MercadoLibre is the strategic first target for country-aware publication, but it is not operationally ready:
  - no validated-ready product,
  - webhook readiness absent,
  - fee and policy modeling incomplete.

## Amazon

### Current evidence

- Webhook status shows Amazon webhook secret not configured.
- Earlier same-day connector review identified missing Amazon webhook ingestion path.
- Fee model and publication policy handling for Amazon are not operationally complete.

### Readiness table

| Capability | State |
|---|---|
| Configured | Partial / inactive |
| Authenticated | Not proven current |
| Operational API connectivity | Not proven current |
| Listings readable | Not proven |
| Orders readable | Not proven |
| Publish flow | Not ready |
| Webhook secret configured | No |
| Event ingestion ready | No |
| Auto fulfillment handoff | No |
| Country-aware support | Minimal |
| Language-aware support | Minimal |
| Currency-aware support | Minimal |
| Fee model support | No |

### Real blocker summary

- Amazon is not a serious operating channel yet.

## Cross-marketplace findings

### What is genuinely real now

- eBay API connectivity is real.
- The platform can distinguish marketplace context in the new validation engine.
- Webhook non-readiness is explicitly observable instead of hidden.

### What is still fake if presented as ready

- “multi-marketplace automation”
- “autonomous selling”
- “active synchronized catalog”
- “cross-border ready”

Those claims are not supported by current operational evidence.

## Independent marketplace verdicts

| Marketplace | Verdict |
|---|---|
| eBay | `PARTIALLY OPERATIONAL WITH RISK` |
| MercadoLibre | `PARTIAL / BLOCKED` |
| Amazon | `NOT READY` |

## Marketplace-specific blockers

### eBay

- Webhooks not configured
- Non-US currency logic incomplete
- No validated-safe live catalog
- Supplier-safe fulfillment not proven after safe engine rebuild

### MercadoLibre

- No webhook readiness
- No validated-safe catalog for Chile
- Simplified fee model
- Policy and language enforcement not fully operational

### Amazon

- Missing webhook readiness
- Incomplete connector/event path
- Incomplete fee and policy models
- No proven operating flow
