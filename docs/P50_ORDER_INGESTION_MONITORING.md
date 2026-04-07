# P50 Order Ingestion Monitoring

## Monitoring posture used in this sprint

Webhook automation remains unavailable for MercadoLibre because `WEBHOOK_SECRET_MERCADOLIBRE` is still not configured.

That means the honest ingestion path for this sprint was the polling/manual fallback already used by the software:

- `syncMercadoLibreOrdersForUser(userId=1, environment='production')`
- exposed operationally by:
  - `POST /api/orders/sync-marketplace`

## Exact live monitoring result

The focused live watcher ran:

- `backend npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420`

Exact result at `2026-03-24T01:07:06.616Z`:

- recent MercadoLibre orders matching listing `MLC3786354420`:
  - `count=0`
  - `orders=[]`
- manual/polling fallback sync result:
  - `marketplace=mercadolibre`
  - `userId=1`
  - `fetched=0`
  - `created=0`
  - `skipped=0`
  - `errors=[]`
- internal order rows for `productId=32690` with `paypalOrderId` starting `mercadolibre:`:
  - none

## Exact order truth

No real MercadoLibre buyer order was detected for `MLC3786354420` during this sprint.

Therefore:

- no MercadoLibre order id exists yet for this listing in software truth
- no internal order row exists yet for `productId=32690`
- no order state progression started yet

## Honest stop condition

This sprint reached:

- `monitored_no_order_yet`

with an additional live risk signal:

- the listing had drifted back to `under_review / waiting_for_patch` while monitoring was performed
