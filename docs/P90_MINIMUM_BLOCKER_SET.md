# P90 — Minimum blocker set (NOT_READY)

Verdict: **NOT_READY_FOR_CONTROLLED_REAL_WEB_TEST**. Only the blockers that **actually** prevent calling the controlled web test “closed”:

| # | Blocker | Class | Exact next action |
|---|---------|--------|-------------------|
| 1 | **No operational evidence** that Mercado Libre **order/payment notifications** hit the **deployed** webhook and updated proof / order state | **critical / blocking** | Fire a **real or test** ML notification against production/staging URL; confirm `recordWebhookEventProof` + `recordSaleFromWebhook` outcomes in DB/logs |
| 2 | **No operational evidence** of **buy → order → fulfillOrder** (even dry/low-value) for the ML listing under test | **critical / blocking** | Run one **supervised** purchase path; capture order id, fulfill result, supplier order id or failure |
| 3 | **Production posture** for post-sale: strict webhook gate may still be **off** (`ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET` default false) | **partial / non-blocking** for *code* readiness; **blocking** for *strict* real-money policy | If required: set secret + env to `true` in the **real-money** environment |

**Not listed as blockers here:** canonical pricing path, preflight API/UI, image fail-closed publish (addressed in P89 and verified in code this sprint).
