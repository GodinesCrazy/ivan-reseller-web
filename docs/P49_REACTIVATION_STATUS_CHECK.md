# P49 Reactivation Status Check

## Classification
- `listing_active_policy_clean`

## Exact before / after MercadoLibre state
- before replacement:
  - `status=under_review`
  - `sub_status=["waiting_for_patch"]`
  - permalink:
    `https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM`
- after replacement:
  - `status=active`
  - `sub_status=[]`
  - same permalink retained

## Public visibility
- public HEAD check on the listing URL returned:
  - `StatusCode=200`

## Local software sync after success
- product:
  - `status=PUBLISHED`
  - `isPublished=true`
  - `publishedAt=2026-03-24T00:54:06.452Z`
- marketplace listing row:
  - `status=active`
  - `listingId=MLC3786354420`
