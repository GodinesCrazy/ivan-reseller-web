# Prioritized Rebuild Action Plan

Date: 2026-03-20

## P0 - Must fix immediately

### 1. Reconcile unsafe product statuses

- Issue: `APPROVED` and `PUBLISHED` rows still exist without validated publish context.
- Root cause: historical status drift and incomplete normalization after freeze.
- Layer: DB + backend + admin tooling.
- Business impact: fake publishability, unsafe operator assumptions.
- Fix: force reconcile all products not backed by validated-safe evidence into `LEGACY_UNVERIFIED` or a blocked state.
- Expected outcome: no row can appear publishable without machine-verifiable context.
- Validation: DB snapshot shows `APPROVED=0` and `PUBLISHED=0` unless tied to active verified listings.
- Competitive gain: stronger truthfulness than catalog-first competitors.

### 2. Remove legacy-linked listing artifacts from live truth surfaces

- Issue: `508` legacy-linked listing rows remain.
- Root cause: historical failed-publish residue.
- Layer: DB + listings service + UI filters.
- Business impact: ghost listing counts and stale operator signals.
- Fix: archive/detach all listing rows connected to frozen products and exclude them from all active metrics.
- Validation: active listing surfaces match only real active marketplace listings.
- Competitive gain: cleaner operator cockpit and less false inventory.

### 3. Make webhook readiness a hard operational gate

- Issue: all webhook secrets are currently false.
- Root cause: configuration incomplete.
- Layer: deployment + backend readiness.
- Business impact: fake automation and delayed order truth.
- Fix: require webhook-ready state for operational connector readiness.
- Validation: `/api/webhooks/status` true per active marketplace; autopilot remains blocked until then.
- Competitive gain: more honest automation readiness than competitors with hidden manual gaps.

### 4. Kill generic/default currency fallbacks for live publish paths

- Issue: some eBay sites still fall back to USD incorrectly.
- Root cause: incomplete destination/currency mapping.
- Layer: backend internationalization.
- Business impact: fake profit and wrong listing context.
- Fix: require explicit site-to-country-to-currency mappings; block unresolved contexts.
- Validation: test matrix for eBay US/ES/UK/DE returns correct country and currency.
- Competitive gain: stronger international monetization safety.

## P1 - Must fix before controlled real sale

### 5. Make language a hard publish constraint

- Issue: language context exists but is not strongly enforced.
- Root cause: architecture ahead of publish workflow.
- Layer: backend + UI.
- Business impact: wrong-language listings, weaker conversion, compliance risk.
- Fix: require explicit publication language and content readiness before publish.
- Validation: no listing may be prepared without resolved language and verified content source.
- Competitive gain: stronger cross-border listing discipline.

### 6. Complete fee ledger for every publish decision

- Issue: fee model remains partial and partly generic.
- Root cause: fee engine incomplete and split across services.
- Layer: finance + pricing + publication.
- Business impact: false profit and hidden losses.
- Fix: unify publish-time fee ledger with completeness threshold.
- Validation: every publish candidate returns complete fee breakdown and completeness score.
- Competitive gain: trust-based profit protection.

### 7. Finish marketplace event-flow proof

- Issue: eBay API is live but webhook-driven automation is not proven.
- Root cause: webhook config and event observability missing.
- Layer: integrations + workers + UI.
- Business impact: automation remains partial/manual.
- Fix: complete webhook registration, ingestion audit trail, and visible event flow for eBay and MercadoLibre.
- Validation: real event creates/updates order and triggers fulfillment pipeline with trace.
- Competitive gain: actual automation instead of scheduled polling only.

### 8. Build first-class validated catalog UI

- Issue: frontend does not clearly represent safe catalog states.
- Root cause: UI model lags backend truth model.
- Layer: frontend UX.
- Business impact: operators cannot trust catalog quality or blocked reasons.
- Fix: add dedicated validated catalog and blocked reason surfaces.
- Validation: operator can filter by validated status, country, language, currency, and blocker.
- Competitive gain: stronger operator trust and throughput.

## P2 - Must fix before scaling

### 9. Add publication policy engine per marketplace/site

- Issue: policy handling is too weak for international scaling.
- Root cause: publish validation focuses on supplier/cost more than marketplace compliance.
- Layer: backend publication.
- Business impact: listing rejection risk and policy violations.
- Fix: implement site/country policy packs and block on unresolved policy gaps.
- Validation: publish preflight returns policy completeness by marketplace/site.
- Competitive gain: safer multi-country scaling.

### 10. Add FX auditability and multi-currency ledger

- Issue: FX is not a first-class audited cost.
- Root cause: local fee/cost logic optimized for narrow flows.
- Layer: finance + internationalization.
- Business impact: false global margins.
- Fix: store FX source, timestamp, rate, conversion fee, normalized audit currency.
- Validation: finance UI and publish ledger show full conversion basis.
- Competitive gain: stronger cross-border profit control.

### 11. Prove queue idempotency and failure recovery

- Issue: worker breadth is larger than proven reliability.
- Root cause: limited production observability.
- Layer: workers/BullMQ/ops.
- Business impact: duplicate actions, missed retries, unsafe automation under scale.
- Fix: add idempotency keys, dead-letter visibility, poison-job monitoring.
- Validation: staged failure tests show predictable recovery without duplicates.
- Competitive gain: enterprise-grade automation reliability.

## P3 - Must fix before claiming competitive superiority

### 12. Expand supplier breadth and fallback quality

- Issue: strict validation currently finds zero validated winners in tested runs.
- Root cause: source quality and supplier coverage are too weak.
- Layer: discovery + supplier strategy.
- Business impact: no revenue-ready catalog.
- Fix: broaden supplier search quality and ranked fallback coverage.
- Validation: repeated strict discovery yields real `VALIDATED_READY` products.
- Competitive gain: safer catalog generation than commodity tools.

### 13. Make automation decisioning fully explainable in UI

- Issue: explainability is stronger in backend direction than UI execution.
- Root cause: audit trail not yet productized.
- Layer: UX + backend.
- Business impact: low operator trust and poor debugging speed.
- Fix: automation ledger showing evidence behind every publish/block/reprice/fulfillment action.
- Validation: operator can inspect exact decision chain for any listing/order.
- Competitive gain: rare transparency advantage versus incumbents.

### 14. Build operator-grade failure cockpit

- Issue: failures are still easier to discover in DB/audits than in UI.
- Root cause: operations UX underdeveloped.
- Layer: frontend.
- Business impact: slow recovery and hidden business loss.
- Fix: dedicated incidents/recovery workspace with root cause and safe next action.
- Validation: failed order or failed publish is immediately visible with exact blocker.
- Competitive gain: superior control plane.

## P4 - Quality improvements / strategic optimization

### 15. Add confidence-weighted opportunity scoring

- Issue: discovery does not yet rank opportunities by supplier/country certainty strongly enough.
- Root cause: safe engine is blocking correctly but not yet prioritizing well enough.
- Layer: discovery intelligence.
- Business impact: low catalog yield.
- Fix: rank by ship-to-country coverage, fee completeness, supplier fallback depth, policy confidence.
- Validation: better validated-ready hit rate per search batch.
- Competitive gain: smarter quality-over-quantity sourcing.

### 16. Add country-specific copy and listing-content quality controls

- Issue: language and merchandising quality remain under-enforced.
- Root cause: international content system incomplete.
- Layer: publication/content.
- Business impact: lower conversion and compliance risk.
- Fix: content packs by marketplace/country/language.
- Validation: listings carry validated content metadata.
- Competitive gain: better localized commerce intelligence.

## Bottom line

The current rebuild priority is not “more features.”  
It is:

1. remove fake truth,
2. remove unsafe statuses,
3. finish event-driven readiness,
4. complete fee and international correctness,
5. prove one real safe product and one real safe sale.
