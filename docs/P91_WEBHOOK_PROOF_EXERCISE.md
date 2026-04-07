# P91 — Webhook proof exercise (Mercado Libre)

## Target behavior (code reference)

- `POST` … `/webhooks/mercadolibre` → `createWebhookSignatureValidator('mercadolibre')` → `recordWebhookEventProof` → `recordSaleFromWebhook` (`webhooks.routes.ts`).  
- Proof row: `systemConfig` key `webhook_event_proof:mercadolibre` (`webhook-event-proof.service.ts`).

## Exercise performed in this sprint

**None.** No request was sent to a deployed backend URL; no ML test notification was injected; no DB read of `webhook_event_proof:mercadolibre` was performed from this environment.

## Configuration (not verified live)

| Item | Status |
|------|--------|
| Public webhook URL reachable from ML | **NV** |
| `WEBHOOK_SECRET_MERCADOLIBRE` set on target stack | **NV** |
| Event received | **No** |
| Proof persisted | **Not observed** |
| Order side effects | **Not observed** |

## Classification

**webhook_not_proven** for this controlled candidate slice.

## Minimum next action

On **target stack**: send one **controlled** ML orders notification (or ML’s verification ping if applicable) with valid signature; confirm 200 response, then confirm `recordWebhookEventProof` updated `inboundEventSeen` / timestamps (or equivalent logs).
