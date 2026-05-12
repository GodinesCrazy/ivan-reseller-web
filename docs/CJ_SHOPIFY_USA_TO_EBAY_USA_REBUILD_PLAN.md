# CJ Shopify USA Audit and CJ eBay USA Rebuild Plan

Date: 2026-05-12

## Audit Verdict

1. `backend/src/modules/cj-shopify-usa/services/cj-shopify-usa-publish.service.ts`
   - Confirmed. The file has 2,473 lines.
   - The audit is directionally correct: it still mixes publish orchestration, Shopify state checks, image validation, duplicate detection, title heuristics, description formatting, variant option shaping, and storefront verification.
   - Nuance: some title/description logic was already extracted into `cj-shopify-usa-title-builder.service.ts`, but the original service still contains duplicate helpers and should be finished as a staged refactor, not a risky one-shot rewrite.

2. `backend/src/modules/cj-shopify-usa/services/cj-shopify-usa-order-ingest.service.ts`
   - Confirmed. Webhook handlers accepted `body: any`, and `normalizeShopifyWebhookOrderId(body: any)` parsed external Shopify payloads without a runtime schema.
   - Fixed in this pass with a Zod schema: `cjShopifyUsaWebhookOrderPayloadSchema`.

3. `backend/src/modules/cj-shopify-usa/services/cj-shopify-usa-profit-guard.service.ts`
   - Confirmed. `enrichMissingShipping` calls CJ live freight quotes for active listings missing shipping data.
   - Nuance: `qualification.service.ts` only evaluates with already-supplied shipping costs; the live CJ quote pressure is in Profit Guard enrichment and related supplier adapter flows.
   - Fixed in this pass with cache-aside through the existing `cacheService`, backed by Redis when `REDIS_URL` exists and memory otherwise.

## Shopify USA Stabilization First

Goal: make CJ-Shopify USA the trusted reference before cloning behavior into CJ-eBay USA.

Completed now:

- Add strict-ish runtime validation for Shopify order webhook IDs.
- Replace webhook `any` with `unknown` at service boundaries.
- Add Redis/memory cache for Profit Guard freight enrichment using `OPPORTUNITY_CJ_FREIGHT_CACHE_TTL_MS`.

Next Shopify refactor:

- Move remaining pure publish helpers out of `cj-shopify-usa-publish.service.ts`:
  - title normalization and quality checks,
  - description HTML construction,
  - image URL parsing and validation,
  - variant option construction,
  - Shopify handle/SKU normalization.
- Keep `cj-shopify-usa-publish.service.ts` focused on orchestration:
  - DB load and idempotency,
  - qualification checks,
  - Shopify API calls,
  - reconciliation and trace writes.
- Add focused tests for extracted helpers before deleting duplicated code.

## CJ eBay USA Target Module

The existing `backend/src/modules/cj-ebay` is not empty: it already has listing, qualification, pricing, opportunity, fulfillment, order, refund, alert, trace, and readiness services. The rebuild should therefore be an upgrade to Shopify-grade parity, not a blind copy.

Backend parity targets:

- Publication limits:
  - Track monthly eBay listing count.
  - Track monthly eBay amount/value limit.
  - Block or queue publishing before crossing either limit.
- eBay economics:
  - Use eBay final value fee, fixed order fee, promoted listing allowance, payment/transaction assumptions, refund risk, CJ product cost, CJ freight, incident buffer, and desired net margin.
  - Store a pricing snapshot per draft/listing so Profit Guard can prove every active listing.
- eBay listing policy adaptation:
  - Title limit 80 chars.
  - Buyer-safe title cleanup, no supplier/CJ codes.
  - eBay item specifics/aspects from CJ variant attributes.
  - Policy-safe description HTML, no unsupported claims, no external links, no Shopify-specific text.
  - Image list capped and validated for eBay marketplace requirements.
- eBay store optimizer:
  - Identify underpriced active listings.
  - Identify listings consuming monthly amount limit with weak projected margin.
  - Recommend price changes, pause/archive, or promotion budget adjustments.
  - Prioritize inventory with US warehouse/faster ETA when available.
- Sales agent parity:
  - eBay-specific opportunity scoring.
  - eBay fee-aware recommended price.
  - Monthly quota-aware publish decisions.
  - Risk labels for account-policy blocks such as overseas warehouse restrictions.

Frontend parity targets:

- Mirror the usable CJ-Shopify USA structure:
  - overview,
  - discover/opportunities,
  - products,
  - listings,
  - orders/order detail,
  - profit guard,
  - alerts,
  - logs,
  - settings,
  - eBay sales/store optimizer.
- Keep eBay-specific UI visible:
  - monthly listing count limit,
  - monthly amount limit,
  - available quota,
  - eBay fee assumptions,
  - policy/account blockers,
  - listing quality warnings,
  - publish queue state.

## Execution Phases

1. Shopify hardening
   - Finish Zod webhook typing.
   - Finish freight cache.
   - Refactor publish helpers in small tested slices.

2. eBay backend parity
   - Audit current `cj-ebay` services against Shopify reference.
   - Add missing monthly quota service.
   - Add quota guard to draft/publish pipeline.
   - Extend pricing/profit guard snapshots with eBay fee detail.
   - Add listing content adapter for eBay policy.

3. eBay frontend parity
   - Compare `frontend/src/pages/cj-shopify-usa` and `frontend/src/pages/cj-ebay`.
   - Add missing eBay pages/components.
   - Add quota, optimizer, and policy-block panels.

4. Verification
   - Type-check backend.
   - Run focused unit tests for Shopify policy/title/webhook/cache behavior.
   - Run frontend build/type-check if available.
   - Smoke endpoints for both modules in safe/dry-run mode.
