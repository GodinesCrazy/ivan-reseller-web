# P4 MercadoLibre Decision

## Decision
- `KEEP DEFERRED`

## Why
- eBay is the closest marketplace to operational truth today.
- eBay OAuth is already real and usable.
- eBay still lacks webhook completion and still has no validated product.
- Splitting effort into MercadoLibre before closing those two gaps would dilute the recovery path.

## Exact Opportunity Cost
Starting MercadoLibre now would add:
- another webhook/OAuth proof track
- another country/site policy surface
- another fee/currency validation surface

while the current dominant blocker is still supplier reality on the first safe candidate.

## When MercadoLibre Should Resume
- after real eBay webhook proof exists
- after the first eBay-safe validated candidate exists
- or after supplier-pipeline improvements clearly show that eBay US is structurally worse than another supported market
