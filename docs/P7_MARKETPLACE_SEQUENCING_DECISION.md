# P7 Marketplace Sequencing Decision

## Decision

- `REQUIRE NEW SUPPLIER INTEGRATION BEFORE ANY MORE MARKETPLACE WORK`

## Why this decision was chosen

- eBay plumbing is no longer the dominant blocker.
- eBay OAuth is real and usable.
- eBay webhook infrastructure is materially real up to subscription registration.
- No safe listing/order path exists yet because supplier truth still fails before publishability.
- Repeating eBay execution without changing supplier capability is low-yield.
- Starting MercadoLibre now would move effort sideways instead of addressing the supplier bottleneck.

## Why MercadoLibre was not selected

- There is no evidence yet that MercadoLibre would overcome the current supplier stock problem.
- The current failure pattern is supplier-side and destination-validity-side, not specifically eBay-plumbing-side.
- Opening another marketplace track now would create activity without increasing the odds of the first safe candidate.

## Allowed next sequencing after P7

Only one sequencing move is justified now:

- build or integrate a new production-safe supplier path first

After that, sequencing between eBay and MercadoLibre can be re-evaluated from fresh supplier evidence.
