# P50 Live Listing Status Watch

## Scope

- `productId = 32690`
- `listingId = MLC3786354420`

## Commands / live checks used

- `backend npm run check:ml-chile-controlled-operation -- 1`
- `backend npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420`
- public HEAD check:
  - `Invoke-WebRequest -Uri 'https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM' -Method Head`

## Exact current truth

Fresh runtime evidence at `2026-03-24T01:07:06.616Z` showed:

- product:
  - `id=32690`
  - `status=PUBLISHED`
  - `isPublished=true`
  - `publishedAt=2026-03-24T00:54:06.452Z`
- local marketplace listing row:
  - `listingId=MLC3786354420`
  - `productId=32690`
  - `status=failed_publish`
  - `updatedAt=2026-03-24T01:00:00.798Z`
- live MercadoLibre item snapshot:
  - `status=under_review`
  - `sub_status=["waiting_for_patch"]`
  - same permalink retained:
    `https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM`
- public permalink HEAD check:
  - `HTTP 200`

## Exact status drift

P49 proved the listing was reactivated successfully and was `active` immediately after image replacement.

By the P50 live watch, that state had drifted:

- from P49:
  - `status=active`
  - `sub_status=[]`
- to P50 live truth:
  - `status=under_review`
  - `sub_status=["waiting_for_patch"]`

So the listing still maps correctly to `productId=32690`, but it is not currently in the same clean active state that existed at the end of P49.
