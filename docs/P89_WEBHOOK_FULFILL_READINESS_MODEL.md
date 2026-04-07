# P89 — Webhook + fulfill readiness model

## Webhook / order ingestion

| Layer | Verified in code | Surfaced in preflight |
|--------|------------------|------------------------|
| HMAC secret present (`WEBHOOK_SECRET_MERCADOLIBRE`) | Yes (`getWebhookStatus`) | `postsale.mercadolibreWebhookConfigured` |
| Signature verification middleware | Yes (when secret + `WEBHOOK_VERIFY_SIGNATURE`) | Indirect (notes) |
| Inbound event seen / subscriptions / “event flow ready” | **Partially** — `getWebhookEventProof` + `getConnectorReadinessForUser` | `mercadolibreEventFlowReady`, `warnings` if not ready |
| End-to-end “order in DB matches ML” | **Not fully proven** in this sprint | Documented as limitation |

## Strict publish gate (optional)

- Env: `ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET` (default `false`).  
- When `true`, `MarketplaceService.publishProduct` **throws** if ML webhook secret is unset — fail-closed for **API/web publish**.

## Fulfill / supplier purchase

- **Prerequisite:** valid `aliexpressUrl` on product (preflight: `fulfillPrerequisiteAliExpressUrl`).  
- **Auto-purchase / fulfillOrder** paths exist in codebase but **production E2E proof** (buy → webhook → fulfill → supplier order) is **not** asserted by P89.  
- Preflight `verificationNotes` explicitly state that AliExpress dropshipping credentials and runtime order ingestion must be verified separately.

## Honesty rule

UI and API must **not** claim automation-ready when `eventFlowReady` is false; preflight emits **warnings** instead of silent pass.
