# P92 — Webhook proof unlock

## Dependency

Webhook proof for this candidate requires:

1. A **live ML listing** (`listingId`) for the internal product.  
2. **Target stack** URL + `WEBHOOK_SECRET_MERCADOLIBRE` + ML app notifications.  
3. A **purchase or test notification** that hits `POST /webhooks/mercadolibre` and runs `recordWebhookEventProof` + `recordSaleFromWebhook`.

## This sprint

**Unchanged / not unlocked** — no listing exists; no webhook exercise performed.

## Classification

**webhook_not_proven** for this candidate (same as P91 until publish + event).

## Exact next step

Complete publish staging, then run one controlled ML order notification against the deployment; verify `systemConfig` key `webhook_event_proof:mercadolibre` and order row creation.
