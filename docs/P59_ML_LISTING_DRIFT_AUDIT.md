# P59 — MercadoLibre Listing Drift Audit

Date: 2026-03-24  
Sprint: P59 — Listing Stability Recovery

## Objective

Recheck the real current state of MLC3786354420.

## Controlled Listing Identity

| Field | Value |
|-------|-------|
| listingId | MLC3786354420 |
| productId | 32690 |
| permalink | https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM |

## P59 Live Recheck Attempt

**Commands attempted:**
- `npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420`

**Result:** FAIL — `FATAL: sorry, too many clients already`. No fresh MercadoLibre API item status obtained.

## Public Accessibility Check

**Permalink fetch (P59):** HTTP 200. Page returns MercadoLibre content (login/account prompt). Does not prove listing is active or sellable; ML may show interstitial for under_review items.

## Last Known Live State (P50, 2026-03-24T01:07:06Z)

| Aspect | Value |
|--------|-------|
| Live MercadoLibre status | under_review |
| Live MercadoLibre sub_status | ["waiting_for_patch"] |
| Public permalink | HTTP 200 |
| Local product | PUBLISHED, isPublished=true |
| Local listing row | exists, listingId=MLC3786354420 |

## Local Marketplace Listing Truth

- `marketplace_listing` row exists for productId=32690, marketplace=mercadolibre, listingId=MLC3786354420
- Local state may be stale if ML API state changed since last sync

## Classification

| Classification | Applicable | Notes |
|----------------|------------|-------|
| active_and_sellable | No | P50 showed under_review |
| under_review | Yes | Last known |
| waiting_for_patch | Yes | Last known sub_status |
| blocked | Possible | If ML blocks until patch |
| drifted | Yes | From P49 active to under_review |
| unknown_due_runtime_issue | Partial | P59 could not obtain fresh API state due to DB exhaustion |

## Conclusion

- **Exact current listing state:** Unknown — live API check blocked by Postgres connection exhaustion.
- **Last known:** under_review, sub_status=["waiting_for_patch"].
- **Public permalink:** HTTP 200 (does not prove sellable).
- **Next:** Re-run p50-monitor (or equivalent) when DB capacity is restored to obtain fresh API state.
