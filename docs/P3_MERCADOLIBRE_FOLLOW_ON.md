# P3 MercadoLibre Follow-On

## Decision

`NOT ATTEMPTED`

## Why

P3 priority order required:

1. repair eBay connector truth
2. prove eBay OAuth usability
3. push eBay webhook readiness as far as possible
4. only then consider MercadoLibre

eBay remained blocked at the webhook-registration stage, so switching focus to MercadoLibre during this phase would have diluted the real blocker instead of clearing it.

## Current MercadoLibre Position

- still partial/manual
- still not event-ready
- still lacking webhook proof in the current evidence set

## P4 Recommendation

Only move to MercadoLibre follow-on after:

- eBay destination/subscription registration is either completed or explicitly waived
- first eBay webhook proof is captured or definitively blocked by external console access
