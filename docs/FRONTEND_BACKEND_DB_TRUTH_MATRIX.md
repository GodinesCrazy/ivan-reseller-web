# Frontend / Backend / DB Truth Matrix

Date: 2026-03-20

## Evidence scale

- `Live now`: public production endpoint or frontend check performed in this session
- `Same-day live`: protected production verification performed earlier today
- `DB`: current database snapshot/anomaly scan
- `Code`: direct current code inspection

## Matrix

| Entity | Frontend reality | Backend reality | DB reality | Marketplace reality | Gap | Severity |
|---|---|---|---|---|---|---:|
| Products total | Products page exists, but current UI type model lags new statuses | Inventory summary protected; last same-day production summary corrected counts | `32650` total products | No live active catalog proven | UI cannot be trusted as full truth model for modern statuses | High |
| Legacy products | Products UI type does not clearly include `LEGACY_UNVERIFIED` | Freeze logic exists | `30351` products are `LEGACY_UNVERIFIED` | Not publishable | Legacy freeze is real in DB but not clearly surfaced in UI | High |
| Validated-ready products | No clear dedicated UI proof | New backend status exists | `0` | None | UI likely cannot explain why there are zero validated winners | High |
| Published products | Same-day production UI/endpoint contradiction was reduced after deploy | Same-day production inventory summary reported `0` published and `0` listings | DB still has `1` `PUBLISHED` product with no listing, no SKU, no target country, no costs | Active marketplace listings not proven | Endpoint truth improved, DB truth still dirty | Critical |
| Approved products | UI likely still treats `APPROVED` as useful/publishable-adjacent | Backend safe-publish path no longer trusts generic approval | `1523` `APPROVED` products lacking safe context | No marketplace proof | Approval state is semantically inflated | Critical |
| Marketplace listings | No proof of clean listings UI in current app | Production endpoint last verified same-day showed 0 active listings | Listing rows are only failed-publish artifacts: `351 ML`, `157 eBay` | No live active listings proven | Listing dataset is largely failure history, not commerce reality | Critical |
| Legacy-linked listings | Not likely visible to operator | No public endpoint exposing this clearly | `508` legacy-linked listings remain | None | Ghost linkage risks stale operator signals | High |
| Orders | Orders page exists | eBay real order sync was proven same-day | Orders: `FAILED=44`, `PURCHASED=5`, `PURCHASING=2` | eBay real order path partial | Current order base is dominated by failure history, not healthy operations | High |
| Last failed real order | UI visibility unclear | Same-day earlier evidence proves supplier failure | DB last failed order contains `SKU_NOT_EXIST` | Real supplier failure | Failure root cause is real and should be surfaced more strongly | Critical |
| Finance profit truth | Finance dashboard is broad | Same-day protected production profit endpoint includes `profitClassification` and `feeCompleteness` | DB coverage shows almost universal missing shipping/total cost on catalog | No live profitable validated catalog | Financial UI breadth exceeds cost-data maturity | High |
| Setup / integrations | Integrations/setup UI likely improved | Same-day setup-status deduped and returned operationalCount | DB not the source of truth here | eBay operational, webhooks absent | Connector truth improved but is still incomplete | Medium |
| Webhooks | No strong operator cockpit for webhook readiness proven | `GET /api/webhooks/status` live now shows all false | Not DB-centered | All three false | Event-flow readiness is plainly not live | Critical |
| Autopilot | Control center presents readiness abstractions | Same-day production autopilot remained blocked | Worker breadth exists in code | Connectors/webhooks incomplete | Automatic mode still not honestly sell-ready | Critical |
| Country context | UI context visibility weak | New backend services support country-aware validation | Most catalog rows missing targetCountry | ML CL and eBay US contexts proven in safe engine | Architecture improved faster than UI and DB coverage | High |
| Language context | UI context visibility weak | Context service maps language | No strong stored publication-language proof for most products | No validated language-safe listing | Wrong-language listing risk remains | High |
| Currency context | UI visibility weak | Context service partially maps currency, destination service has risky defaults | Example published anomaly row has `currency=USD` with null country | No safe cross-country live listing proof | Currency truth is incomplete and can create fake margin | Critical |
| Publication costs | UI likely aggregates finance views | Fee engines exist but remain incomplete | Most products lack totalCost | No active validated listing | Publication cost truth is not globally modeled | Critical |
| Manual intervention states | UI quality not proven strong | Backend still has partial fallback and failure handling | Failed orders exist | Supplier failures occurred | Manual fallback design is weaker than required for operator trust | High |

## Key contradictions

1. A product can still exist as `PUBLISHED` in DB without:
   - marketplace listing
   - target country
   - AliExpress SKU
   - shipping cost
   - total cost
2. `APPROVED` still exists at scale without safe publish proof.
3. Listing records mostly represent failed publication attempts rather than active commerce inventory.
4. Finance endpoint maturity is ahead of catalog cost completeness.
5. Country/language/currency architecture exists, but the majority of catalog rows still do not carry those validated fields.

## Exact blocking mismatches

| Blocking mismatch | Root cause | Remediation |
|---|---|---|
| `PUBLISHED` row with no active listing | Historical status drift and incomplete freeze normalization | Force-reconcile all `PUBLISHED`/`APPROVED` rows into safe states unless validated and linked to active marketplace listings |
| Legacy-linked listing artifacts | Historical failed-publish residue | Detach or archive all listing rows connected to `LEGACY_UNVERIFIED` products |
| UI status model missing new truth states | Frontend lags backend model | Add `LEGACY_UNVERIFIED`, `VALIDATED_READY`, blocked/rejected reasons, and publishability explanation |
| Currency and country not present on most rows | Catalog created before new safe engine | Rebuild only through strict validation path; do not rehabilitate legacy rows in place |
| Webhook readiness invisible in business terms | Technical status not translated into operator risk | Show `configured / authenticated / operational / webhook-ready / event-flow-ready` separately per marketplace |
