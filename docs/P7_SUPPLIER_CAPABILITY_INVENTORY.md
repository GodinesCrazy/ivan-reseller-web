# P7 Supplier Capability Inventory

## Real inventory result

Executed real inventory script:

- `backend/scripts/p7-supplier-capability-inventory.ts`

User:

- `userId=1`

## Capability matrix

| supplier path | current state | stock truth | shipping truth | margin viability | destination support | production safety |
|---|---|---|---|---|---|---|
| AliExpress Affiliate API discovery | production-usable now | low | none | medium | broad | partial |
| AliExpress Dropshipping API validation/purchase | production-usable now | high | high | medium | broad | safe |
| AliExpress preventive supplier audit + fallback ranking | production-usable now | high | high | medium | broad | safe |
| AliExpress alternative product fallback | production-usable now | high | high | medium | broad | partial |
| Smart supplier selector for manual fulfillment | partially implemented | medium | medium | unknown | limited | partial |
| AliExpress native/advanced scraping discovery | partially implemented | low | none | low | unknown | unsafe |
| Supplier adapter abstraction | code skeleton only | none | none | unknown | unknown | unsafe |
| Non-AliExpress production-safe supplier connector | dead / absent as usable path | none | none | unknown | none | unsafe |

## Inventory conclusion

What is actually usable now:

- AliExpress Affiliate discovery
- AliExpress Dropshipping validation/purchase
- AliExpress preventive audit + fallback ranking
- AliExpress alternative-product fallback

What is not usable as a first-sale-safe supplier path:

- any non-AliExpress production-safe supplier connector

## Bottom line

The codebase contains supplier abstractions and some helper logic, but no real production-safe alternative supplier path beyond AliExpress. That means P7 cannot honestly solve first-sale recovery by “switching suppliers” inside the current codebase; it can only prove that a new supplier integration is now the highest-leverage next move.
