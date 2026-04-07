# P89 — Real-world test readiness score

## Verdict: `almost_ready_blocked_by_1_or_2_items`

**Evidence (code + wiring):**

- **MLC pricing truth:** **DONE** for publish/preflight — single path `runPreventiveEconomicsCore` + `mlc-canonical-pricing` mapping + persisted `preventivePublish` + **price drift guard** on publish.  
- **Web preflight contract + UI:** **DONE** — API + Product Preview panel + fail-closed CTA for ML.  
- **Webhook honesty:** **PARTIAL** — preflight surfaces configuration + proof levels; **full event-flow and order→fulfill E2E** still operator-verified.  
- **Strict webhook publish gate:** **OPTIONAL** (env default off) so existing tenants are not surprised.

## What would move to `ready_for_controlled_real_web_test`

1. Operator evidence: at least one **inbound ML webhook** processed in target environment with signature verification on.  
2. Operator evidence: one **controlled purchase** reconciled through order + (dry-run or sandbox) fulfill path.  
3. Enable `ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET=true` in the environment where real money is tested (if you require fail-closed post-sale).

## `not_ready_for_real_web_test` would apply if

- AliExpress DS or ML OAuth broken in that environment, or freight truth missing for CL SKUs you intend to sell, or images not `publishSafe`.
