# P32 Order Readiness Handoff

Date: 2026-03-22

## Handoff status

`done_after_listing_created`

## Listing now under monitoring

- `productId = 32690`
- `listingId = MLC3786354420`
- `permalink = https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM`
- current exact stage: `listing_created`

## Order truth at sprint close

No buyer order is claimed in P32.

At sprint close:

- no MercadoLibre order id captured yet
- no internal order row captured yet
- no supplier purchase attempt started yet

## Immediate next monitoring path

1. Confirm the listing remains active for `MLC3786354420`.
2. Prefer webhook ingestion if MercadoLibre webhook automation becomes configured.
3. While webhook automation remains partial, use manual / polling fallback through the MercadoLibre order sync path:
   `POST /api/orders/sync-marketplace`
4. Confirm any ingested order maps back to `productId = 32690`.
5. Only after a real order exists, observe the supplier purchase attempt and capture:
   - automatic vs manual path
   - real `aliexpressOrderId` if purchase succeeds
   - exact blocker if purchase fails

## Operational note

The codebase already has MercadoLibre order polling fallback support:

- `backend/src/services/mercadolibre-order-sync.service.ts`
- `backend/src/api/routes/orders.routes.ts`

That is the correct next handoff because P32 ended at `listing_created`, not at `order_ingested`.

