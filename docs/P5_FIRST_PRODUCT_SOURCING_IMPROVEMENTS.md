## P5 First Product Sourcing Improvements

### Objective
Improve first-product recovery quality without weakening any safety gate.

### Code Changes
In [multi-region-validation.service.ts](/c:/Ivan_Reseller_Web/backend/src/services/multi-region-validation.service.ts):

- added `FIRST_PRODUCT_QUERY_PROFILES`
- added safer normalized search queries for first-product recovery
- added blocked-term filters to reject misleading search matches earlier
- added preferred first-product source-price ceilings by query
- tightened `candidateMatchesQuery(...)`
- exposed `getSearchQueryForFirstProduct(...)`

### Query Improvements
- `cell phone holder` -> `phone holder stand`
- `usb light` -> `usb light lamp`
- `mouse pad` -> `mouse pad desk mat`
- `desk organizer` -> `desk organizer holder`
- `cable organizer` -> `cable organizer clip`

### Safety Improvements
- obvious junk matches are rejected earlier
- expensive first-product candidates are filtered earlier
- weak semantic matches are classified explicitly instead of silently wasting supplier validation

### Validation
Focused regression coverage was added in:
- [multi-region-validation.service.test.ts](/c:/Ivan_Reseller_Web/backend/src/__tests__/services/multi-region-validation.service.test.ts)

The tests verify:
- normalized first-product query selection
- rejection of bad semantic matches
- acceptance of simple relevant matches

### Net Effect
P5 improved sourcing quality and reporting honesty. It did not relax profitability, stock, shipping, language, currency, or fee constraints.
