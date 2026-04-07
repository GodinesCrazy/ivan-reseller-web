# P58 — Controlled Listing Status Recheck

Date: 2026-03-24  
Sprint: P58 — Controlled Commercial Proof Path

## Objective

Confirm the controlled listing is still the valid commercial lead path.

## Controlled Listing Identity

| Field | Value |
|-------|-------|
| listingId | MLC3786354420 |
| productId | 32690 |
| product title | Soporte organizador de enchufes montado en la pared |
| marketplace | MercadoLibre Chile (MLC) |

## Last Known Live State (P50, 2026-03-24T01:07:06Z)

| Aspect | Value |
|--------|-------|
| Local product | PUBLISHED, isPublished=true |
| Live MercadoLibre item status | under_review |
| Live MercadoLibre sub_status | ["waiting_for_patch"] |
| Public permalink | HTTP 200 |
| Classification | drifted (from P49 active) |

## P49 Baseline (Pre-Drift)

- status=active
- sub_status=[]
- Public URL HTTP 200
- Images: cover_main.png, detail_mount_interface.png from product-32690 asset pack

## P58 Live Recheck Attempt

**Attempted commands:**
- `npm run check:ml-chile-controlled-operation -- 1`
- `npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420`

**Result:** Both failed with `FATAL: sorry, too many clients already` (PostgreSQL connection pool exhausted). No fresh live listing status obtained in this sprint.

## Local/Backend Mapping

- `marketplace_listing` row exists for productId=32690, marketplace=mercadolibre, listingId=MLC3786354420
- Product 32690 mapped; `isPublished=true` in local DB
- Listing URL: `https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM`

## Classification (from P50 + code inspection)

| Classification | Applicable |
|----------------|------------|
| active_and_sellable | No — P50 showed under_review |
| under_review | Yes — waiting_for_patch |
| blocked | Possible if ML blocks until patch applied |
| drifted | Yes — from P49 active to under_review |
| missing | No — listing exists, permalink returns 200 |

## Conclusion

- **Status:** Drifted to `under_review / waiting_for_patch` per P50.
- **Valid commercial lead path:** Yes, if listing is cleared back to active. The listing and product mapping are valid; the blocker is MercadoLibre review state.
- **Highest-leverage next move:** Resolve or clear the `waiting_for_patch` review state, then re-run live check to confirm active_and_sellable.
