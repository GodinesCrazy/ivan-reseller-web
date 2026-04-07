# P50 Execution Report

## Objective

Resume the controlled-sale path from the reactivated MercadoLibre Chile listing and capture the first real buyer order for:

- `listingId=MLC3786354420`
- `productId=32690`

## Outcome

- no real order observed in this sprint
- exact furthest truthful business stage remained:
  - `listing_active_no_order_yet`

## Commands run

- `backend npm run type-check`
- `backend npm run check:ml-chile-controlled-operation -- 1`
- `backend npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420`
- public permalink check:
  - `Invoke-WebRequest -Uri 'https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM' -Method Head`

## Exact live proof

- controlled-operation runtime:
  - `runtimeUsable=true`
  - `authState=access_token_present`
  - `strictMlChileReadyCount=15`
  - `mlOrdersSummary.total=0`
- live listing watch at `2026-03-24T01:07:06.616Z`:
  - local product remained `PUBLISHED / isPublished=true`
  - live MercadoLibre item was:
    - `status=under_review`
    - `sub_status=["waiting_for_patch"]`
  - public permalink still returned:
    - `HTTP 200`
- order monitoring:
  - matching recent MercadoLibre orders for `MLC3786354420`:
    - `count=0`
  - manual/polling fallback sync result:
    - `fetched=0`
    - `created=0`
    - `skipped=0`
    - `errors=[]`
  - internal `mercadolibre:` orders for `productId=32690`:
    - none

## Exact blocker reached

- no real buyer order occurred during the monitoring window
- additionally, the listing had drifted from the P49 `active` state back to:
  - `under_review / waiting_for_patch`

## Supplier purchase truth

- not attempted because no order was ingested

## Final classification

- `listing_active_no_order_yet`

## Highest-leverage next move

- resolve or clear the renewed MercadoLibre `waiting_for_patch` review state on `MLC3786354420`, then continue monitored order polling through the existing MercadoLibre sync path until the first real buyer order appears
