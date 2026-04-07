# P90 — Order → fulfill readiness check

## Code-exists (verified in repo)

| Stage | Evidence |
|-------|----------|
| Webhook → sale record | `recordSaleFromWebhook` in `webhooks.routes.ts` (ML branch) |
| Order persistence | Final audit references `orderFulfillmentService.fulfillOrder` from post-sale path |
| Fulfill orchestration | `order-fulfillment.service.ts` (tests in `order-fulfillment.service.test.ts`); API triggers in `orders.routes.ts`, `retry-failed-orders.service.ts`, `autopilot.service.ts` |
| Test / dry harness | `test-post-sale-flow.handler.ts` documents simulated vs real `fulfillOrder` |

## Proof-exists (this sprint)

**Not established.** No attached logs, DB snapshots, or CI artifacts showing:

1. A **third-party** (or controlled buyer) purchase on ML →  
2. Webhook processed → **Order** in app in expected state →  
3. `fulfillOrder` run (dry-run or low-value) → **deterministic outcome** (`PURCHASED` / `aliexpressOrderId` / explicit `MANUAL_ACTION_REQUIRED` with reason).

## Readiness tiers (honest)

| Tier | Assessment |
|------|------------|
| **staging-ready** | **Code supports it** — prerequisites from `FINAL_GAP_TO_REAL_WORLD_TEST.md` (listingId, aliexpressUrl, credentials, capital) must still be satisfied per environment |
| **dry-run-ready** | **Partial** — internal test handler exists; not executed in this audit |
| **production-ready** | **Not proven** |
| **not proven** | **Operational E2E for ML Chile controlled test** |

## Exact next action to close

Execute roadmap **Fase 2.1–2.2** (`UPDATED_MASTER_ROADMAP_TO_REAL_PROOF.md`): one **signed or real** ML orders webhook in staging + one **supervised** fulfill attempt (sandbox DS or minimal real order) with captured **order id**, **fulfillment status**, and **supplier order id or failure code**.
