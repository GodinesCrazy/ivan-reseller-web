# CJ Shopify USA Audit and CJ eBay USA Rebuild Plan

Date: 2026-05-12

Update: 2026-05-13

- User-requested correction confirmed: CJ-eBay must be a near visual/logical clone of CJ-Shopify for equivalent pages, with only marketplace-specific behavior differing.
- New production-readiness stance: do not run a real publish until Discover, Overview, Listings, pricing guardrails, category/aspects, and stale operational truth are corrected and a dry-run passes.
- The CJ-eBay operating niche is PET by default for the US market.
- The eBay selling limits configured for this account are 300 total published stock units and USD 20,000,000 exposure.

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

- Discover final skin pass started 2026-05-13:
  - Replaced the "Cuenta nueva / Estandar" opportunity cockpit with a Shopify-like CJ search screen.
  - `pet supplies` is the default keyword.
  - Category menu is PET-first.
  - Search uses real `POST /api/cj-ebay/cj/search`.
  - Results expose stock, warehouse origin, and USA-only guardrail state.
  - Remaining Discover work: connect approved result handoff more tightly into Products and add eBay category/aspects preview in the product cards.
- Automation final skin pass started 2026-05-13:
  - Rebuilt eBay Automation with the Shopify cockpit composition: engine ring, control buttons, phase line, stats row, live log, right-side config, checklist, and explanation panel.
  - Kept eBay-specific data: warehouse USA, quota, order polling, CJ payment, tracking, last run metrics and readiness checks.
  - Remaining Automation work: add dry-run/live mode visibility and richer per-phase event labels from `cj_ebay_automation_runs`.
- Full-page visual alignment pass continued 2026-05-13:
  - Analitica now uses the same dark cockpit hero + compact KPI strip as the operational Shopify pages.
  - Agente eBay now opens as a PET/eBay sales cockpit with the same hero density, quota/profit metrics, scheduler and action sections.
  - Store Optimizer was restyled as an eBay-only cockpit extra instead of a light standalone admin page.
  - Logs and Configuracion were also aligned with hero metrics so secondary pages no longer feel like placeholders.
- Productos CJ still needs final compaction and config separation so it reads less like an admin panel and more like the Shopify product lifecycle table.
- Orders and Order Detail should keep the richer eBay operational evidence, but need final Shopify-style toolbar, chips, pagination density, and detail section alignment.
- Listings already has a true right-side detail drawer and lifecycle line; remaining work is stronger bulk safe actions and final table density polish.
- Profit and Alerts are functional and acceptable; only micro-spacing/density tuning remains if pixel-level parity is required.
- Store Optimizer remains an eBay-only extra and now uses the same cockpit visual language, but it does not substitute any missing Shopify-equivalent page.

Critical production blockers as of 2026-05-13:

- Reset operational data for CJ-eBay before the first real cycle so Overview starts from true zero while preserving credentials and configuration.
- Fix or verify Listings runtime behavior after reset.
- Strengthen eBay PET category/aspects mapping beyond title-only category suggestion.
- Make Discover -> Products handoff explicit so the operator can evaluate the exact CJ product/variant found from Discover.
- Confirm USA warehouse evidence is persisted and visible through evaluation, draft, listing and autopilot run.
- Confirm pricing UI states clearly that eBay fees are operational estimates until settlement integration exists.
- Run dry-run cycle before any real publish.

Operational hardening update 2026-05-13:

- Autopilot `start` no longer forces CJ auto-pay on. Payment remains controlled by the visible `autoPayCjOrders` setting.
- Added `dryRun` support to automation `run-now` and sales-agent execution. Dry-run validates discovery/evaluation/draft/order-poll logic but skips eBay publish, CJ payment, tracking submission, fulfillment writes and recovery writes.
- eBay order polling now supports dry-run mode: it can inspect recent eBay orders without upserting local orders.
- Autopilot discovery/publish now has a PET direct-search fallback when the AI shortlist returns no candidates.
- CJ supplier throttle was increased to reduce 429 pressure.
- Discover -> Products handoff now passes `productId` and keyword so the exact CJ result can be opened in the product pipeline.
- Safe smoke results:
  - `frontend npm run type-check`: passed.
  - `frontend npm run build`: passed.
  - `backend npm run type-check`: passed.
  - `backend npm run build`: passed.
  - `backend npm run cj-ebay:cycle-smoke` in safe mode proved credentials/settings/quota, but local smoke did not complete a candidate because CJ returned repeated 429 during discovery. This blocks declaring the live publication test complete until a deployed dry-run succeeds.

Closure update 2026-05-13:

- Added `backend/scripts/cj-ebay-operational-reset.ts` and `npm run cj-ebay:operational-reset`.
  - Default mode is inspection-only.
  - Destructive reset requires `CJ_EBAY_RESET_CONFIRM=RESET_CJ_EBAY_USA`.
  - Reset preserves credentials and CJ-eBay settings, forces PET niche, USA warehouse only, autopilot paused, and CJ auto-pay off.
- Reset was executed for user `1` after inspecting stale listings:
  - Deleted stale non-PET CJ-eBay operational rows: 3 listings, 9 products, 18 evaluations, 18 shipping quotes, 14 opportunity runs, 37 candidates, 2 automation runs, and 1424 traces.
  - Post-reset validation shows `cj_ebay_listings=0` and `cj_ebay_orders=0`.
- Added `backend/scripts/cj-ebay-bounded-cycle-smoke.ts` and `npm run cj-ebay:bounded-cycle-smoke`.
  - This smoke validates the bounded path: PET keyword discovery against CJ, readiness, credentials, settings, USA-only guardrails, then evaluation/draft when CJ product details are available.
  - It never publishes unless `CJ_EBAY_SMOKE_PUBLISH=true`.
- Live bounded smoke after reset:
  - Readiness: passed.
  - PET default: confirmed with real CJ search keywords.
  - CJ search: returned real PET products for `pet supplies`, `dog grooming brush`, `pet hair remover`, and `cat toy`.
  - Blocker: CJ returned repeated HTTP 429 on `product/query` detail calls for every candidate, so the script could not reach freight/evaluation/draft.
  - Result: the system is clean and guarded, but a real publish proof is still pending because CJ is rate-limiting product detail calls.

Platform CJ API orchestration update 2026-05-14:

- The CJ 429 diagnosis is now treated as a platform-level bottleneck, not a CJ-eBay-only issue.
- Added `cjApiRateLimiterService`, a shared CJ API turn scheduler:
  - Uses Redis (`cj:api:global:*`) when `REDIS_URL` is available so Railway workers/modules coordinate globally.
  - Falls back to an in-process queue locally.
  - Default spacing is 1600 ms; can be tuned with `CJ_API_GLOBAL_MIN_INTERVAL_MS`.
- Wired the limiter into the common CJ Open API client used by CJ-eBay and CJ-ML Chile style flows.
- Wired the limiter into CJ-Shopify USA direct CJ calls for token exchange, create order, and tracking detail polling.
- Added `product/query` fallback to `product/listV2?pid=...` when CJ rate-limits product detail, without relaxing publish guardrails.
- Re-ran bounded CJ-eBay smoke after limiter:
  - Repeated 429s stopped.
  - CJ returned product details, variants, stock checks, freight/evaluation writes.
  - Candidates were rejected by guardrails, so no draft/listing was created. This is correct behavior: no publish if stock/warehouse/margin are not safe.
- Reset CJ-eBay operational truth again after the smoke so production starts clean:
  - Deleted 5 products, 5 evaluations, 5 shipping quotes, 4 automation runs, and 14 traces from the smoke.
  - Listings and orders remained at zero.

Page-by-page parity status after current pass:

- Overview: Shopify-style hero, readiness ring, pipeline, quota and quick actions are present. Needs reset to show true zero state.
- Discover: rebuilt to Shopify-like CJ search with PET default and USA-stock evidence.
- Productos CJ: PET default and eBay/USA copy applied; remaining work is deeper compaction of the large pricing/admin sections.
- Listings eBay: drawer, lifecycle line, filters and conservative bulk actions are present; needs runtime verification after operational reset.
- Orders: Shopify-like hero, KPIs, filters, import eBay ID and dense table are present.
- Order Detail: eBay evidence/refunds/flow kept, with compact hero, status, quick actions and operational sections.
- Post Venta: cockpit dashboard, safe queue, tracking, refunds and alerts are present.
- Alertas: eBay risk center with filters and action cards is present.
- Profit: eBay-specific financial cockpit with estimated fees/margins/refunds is present.
- Analitica: funnel, quota readiness and Profit Guard issues are present.
- Agente eBay: cockpit, scheduler, recommendations and executable actions are present.
- Automatizacion: rebuilt to Shopify cockpit pattern while preserving real eBay autopilot state.
- Configuracion: hero, PET/fees/quotas, impact preview and operational reset are present.
- Logs: real trace table with Shopify/eBay-style hero and evidence metrics is present.
- Store Optimizer: kept as eBay-only extra with cockpit styling, not a substitute for any Shopify-equivalent page.

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
   - Fourth visual pass continued: Discover, Automation, Analitica, Agente eBay, Configuracion, Logs and Store Optimizer received final cockpit/header alignment.
   - Remaining work is now narrower: final interaction parity on Discover -> Products handoff, Productos CJ compaction, Listings bulk safe actions, and authenticated runtime smoke after reset.

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
