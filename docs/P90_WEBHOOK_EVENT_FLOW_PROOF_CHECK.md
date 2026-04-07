# P90 — Mercado Libre webhook event-flow proof check

## Code path (exists)

- **Ingress:** `POST /webhooks/mercadolibre` → `createWebhookSignatureValidator('mercadolibre')` → parse order/listing → `recordWebhookEventProof` → `recordSaleFromWebhook` (`webhooks.routes.ts`).  
- **Proof persistence:** `recordWebhookEventProof` upserts `systemConfig` key `webhook_event_proof:mercadolibre` (`webhook-event-proof.service.ts`).  
- **Readiness aggregation:** `getWebhookEventProof` + `getWebhookStatusWithProof` → `getConnectorReadinessForUser` / preflight `postsale`.

## Operational proof (this sprint)

**Not demonstrated.** This closure audit did **not** inspect production/staging:

- HTTP logs showing a verified ML notification hitting the public URL, or  
- `systemConfig` row for `webhook_event_proof:mercadolibre` with `inboundEventSeen: true` and a recent `lastWebhookEventAt`, or  
- A saved test transcript (e.g. controlled notification + DB snapshot).

## Classification

| Label | Meaning for P90 |
|-------|------------------|
| **webhook_ready_proven** | Requires **runtime evidence** above — **not established in this audit** |
| **webhook_partially_ready** | **Applies:** handler + signature middleware + proof writer exist; ML topics/URL/secret may be configured in env but **not proven here** |
| **webhook_not_proven** | **Applies** if interpreting strictly as “ready for third-party purchase test” without live receipt |

**P90 operational classification:** **`webhook_partially_ready` (code)** / **`webhook_not_proven` (operations)**.

## Exact next action to close

Run **one controlled ML order notification** against the **same base URL** the deployment uses, then confirm in DB (or admin tooling) that `webhook_event_proof:mercadolibre` shows `inboundEventSeen` / `eventFlowReady` as expected, and that `recordSaleFromWebhook` created or updated the expected `Order` row.
