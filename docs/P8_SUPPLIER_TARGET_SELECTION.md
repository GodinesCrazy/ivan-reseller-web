# P8 Supplier Target Selection

## Inputs used

Real supplier-target scan of the codebase:

- strongest non-AliExpress references found for `Alibaba`

Real credential inventory:

- `alibaba = 0 active credentials`
- `cj = 0`
- `cjdropshipping = 0`
- `zendrop = 0`
- `spocket = 0`
- `dsers = 0`
- `1688 = 0`

Real existing production-safe supplier family:

- AliExpress only

## Decision

Primary target:

- `Alibaba`

Backup target:

- `none`

## Why Alibaba won

- It is the only non-AliExpress supplier target with meaningful signals in the current architecture.
- Those signals are stronger than the other alternatives, which currently appear only as competitor or roadmap mentions.
- It has at least partial architectural intent already visible in code and docs.

## Why it still does not pass execution

Even though it is the best next target, it is still not executable safely because:

- no active credentials exist
- no SKU stock truth path exists
- no destination shipping truth path exists
- no shipping-cost truth path exists
- no order-placement truth path exists

## Outcome

P8 selected a real next supplier target, but that target is not yet production-safe or executable under the current strict architecture.
