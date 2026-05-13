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
- Add CJ-eBay USA monthly publication and amount limits as account settings, configurable from the CJ-eBay UI instead of environment-only variables.
- Rebuild CJ-eBay USA navigation to match the CJ-Shopify USA module structure with grouped sidebar sections.
- Add CJ-eBay USA frontend sections for settings, post-sale, analytics, sales agent, automation, and store optimizer.
- Add a CJ-eBay USA store optimizer API that uses active listings, draft state, account quota, margin snapshots, and listing blockers to recommend operator actions.
- Second visual parity pass started after screenshot comparison:
  - CJ-eBay Overview was rebuilt to match the CJ-Shopify operational dashboard pattern: hero/status panel, readiness score, pipeline cards, quick actions, quota warning, alerts, and integration checks.
  - CJ-eBay Listings was upgraded to the Shopify Store Products pattern: header actions, metric filters, search/sort controls, visible-result count, and a cleaner table flow while keeping eBay-specific reconciliation and policy-block actions.
- Third parity pass implemented after page-by-page comparison:
  - Added CJ-eBay cockpit APIs for logs, post-sale dashboard, analytics funnel, profit guard, automation controls, sales agent, scheduler controls, and settings impact preview.
  - Rebuilt CJ-eBay Logs from placeholder into a real trace table backed by `cjEbayExecutionTrace`, with filters, severity, entity context, and expandable JSON metadata.
  - Rebuilt CJ-eBay Post Venta as a Shopify-style safe-queue dashboard adapted to eBay tracking, refunds, manual import, policy blocks, and operational alerts.
  - Rebuilt CJ-eBay Analitica as a cockpit with funnel, quota readiness, eBay economics, Profit Guard issues, and executable profit scan.
  - Rebuilt CJ-eBay Agente eBay as a larger operational cockpit with scheduler controls, opportunity actions, quota-aware recommendations, strategy, and learning/risk panels.
  - Rebuilt CJ-eBay Automatizacion as a control cockpit with start/pause/resume/stop/run-now commands, quota guardrails, readiness checks, and recent trace events.
  - Added CJ-eBay Settings impact preview so monthly listing limits, monthly amount limits, fees, and margin settings show operational consequences before publishing.
  - Added eBay lifecycle line support in Listings so each listing row exposes the Draft -> Offer -> Listing -> Venta flow.

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
  - Expose both limits in the module settings UI for the operator/account owner.
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
  - overview, visually aligned in second pass,
  - discover/opportunities, done,
  - products, done,
  - listings, visually aligned in second/third pass with lifecycle line,
  - orders/order detail, done,
  - post-sale, rebuilt as cockpit in third pass,
  - profit guard, done,
  - analytics, rebuilt as cockpit in third pass,
  - alerts, done,
  - sales agent, rebuilt as cockpit in third pass,
  - automation, rebuilt as cockpit in third pass,
  - settings, done with eBay fee/quota impact preview,
  - logs, real trace table done,
  - eBay store optimizer, done.
- Keep eBay-specific UI visible:
  - monthly listing count limit, done,
  - monthly amount limit, done,
  - available quota, done,
  - eBay fee assumptions, done,
  - policy/account blockers, done,
  - listing quality warnings, partially done from listing detail payload,
  - publish queue state, partially done through listing status, safe queue, automation status, and optimizer recommendations.

Backend endpoints added in third pass:

- `GET /api/cj-ebay/config/preview-impact`
- `GET /api/cj-ebay/logs`
- `GET /api/cj-ebay/post-sale/dashboard`
- `POST /api/cj-ebay/post-sale/run-safe-queue`
- `GET /api/cj-ebay/analytics/funnel`
- `GET /api/cj-ebay/analytics/profit-guard`
- `POST /api/cj-ebay/analytics/profit-guard/run`
- `GET /api/cj-ebay/automation/status`
- `POST /api/cj-ebay/automation/start`
- `POST /api/cj-ebay/automation/pause`
- `POST /api/cj-ebay/automation/resume`
- `POST /api/cj-ebay/automation/stop`
- `POST /api/cj-ebay/automation/run-now`
- `POST /api/cj-ebay/automation/config`
- `GET /api/cj-ebay/sales-agent`
- `POST /api/cj-ebay/sales-agent/actions`
- `GET /api/cj-ebay/sales-agent/scheduler`
- `PATCH /api/cj-ebay/sales-agent/scheduler/config`
- `POST /api/cj-ebay/sales-agent/scheduler/start`
- `POST /api/cj-ebay/sales-agent/scheduler/pause`
- `POST /api/cj-ebay/sales-agent/scheduler/stop`
- `POST /api/cj-ebay/sales-agent/scheduler/run-now`

Remaining visual parity work after third pass:

- Discover still needs a final skin pass to look exactly like Shopify Discover while keeping eBay opportunity scoring.
- Productos CJ still needs final compaction and config separation so it reads less like an admin panel and more like the Shopify product lifecycle table.
- Orders and Order Detail should keep the richer eBay operational evidence, but need final Shopify-style toolbar, chips, pagination density, and detail section alignment.
- Listings already has a true right-side detail drawer and lifecycle line; remaining work is stronger bulk safe actions and final table density polish.
- Profit and Alerts are functional and acceptable, but need minor visual tuning for exact Shopify density.
- Store Optimizer remains an eBay-only extra and should not substitute any missing Shopify-equivalent page.

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
   - Completed first parity pass: CJ-eBay now exposes the same major module areas as CJ-Shopify with eBay-specific settings, quota analytics, post-sale, automation, sales-agent, and store optimizer views.
   - Second visual pass: Overview and Listings now follow the Shopify screen composition more closely.
   - Third visual/API pass: Logs, Post Venta, Analitica, Agente eBay, Automatizacion, Settings preview, and Listings lifecycle are now backed by real eBay APIs and cockpit screens instead of placeholders/light panels.
   - Remaining work is visual micro-parity and interaction parity on Discover, Productos CJ, Orders, Order Detail, Listings bulk safe actions, Profit, and Alerts.
   - Fourth visual pass target: close the final visible gaps with compact Shopify-style headers, metric cards, toolbars, dense tables, safe bulk actions, and final page-by-page acceptance checks.

4. Verification
   - Type-check backend.
   - Run focused unit tests for Shopify policy/title/webhook/cache behavior.
   - Run frontend build/type-check if available.
   - Smoke endpoints for both modules in safe/dry-run mode.

Verification from third pass:

- Frontend `npm run type-check`: passed.
- Frontend `npm run build`: passed.
- Backend `npm run type-check`: passed.
- Backend `npm run build`: passed.
- Endpoint smoke still needs an authenticated runtime check after deploy; compile/build confirms routes are registered, but production auth may return 401 without session tokens.

Final acceptance checklist:

- Discover uses Shopify-like composition while preserving eBay candidate scoring, fees, quota, policy risk, and approve/reject/defer drawer.
- Productos CJ prioritizes the CJ search -> variant -> preview -> evaluate -> draft lifecycle, with advanced pricing/config moved behind secondary panels.
- Listings keeps the eBay drawer and lifecycle line, adds conservative multi-select actions, and never performs bulk publish.
- Orders uses Shopify-like toolbar, chips, density, and local pagination while keeping manual eBay order import.
- Order Detail keeps eBay evidence/refunds/flow but opens with a compact status hero and quick actions.
- Profit and Alerts match Shopify density and explicitly name eBay final value fee, payment fee, promoted allowance, quota exposure, and policy/account blockers.
