# International Publication Audit

Date: 2026-03-20

## Objective

Determine whether Ivan Reseller truly validates by:

`(product, marketplace, destination country, publication language, listing currency)`

and not by generic product-only logic.

## Current conclusion

- Country-aware architecture: `PARTIAL`
- Language-aware publication: `BROKEN / PARTIAL`
- Currency-aware publication and profit: `BROKEN / PARTIAL`
- Country/site policy handling: `BROKEN`

## What is now correct

### New marketplace context layer

The code now contains a marketplace-context service that explicitly resolves:
- marketplace
- country
- currency
- language
- region
- fee model intent
- shipping expectation

### New validation pattern

The new safe validation engine treats validation as:

`product + marketplace + country`

This is a major improvement and is one of the most strategically important architectural wins in the system.

### Verified contexts

- MercadoLibre Chile -> `CL / CLP / es / MLC`
- eBay USA -> `US / USD / en / EBAY_US`

These contexts were used in real validation runs that still rejected products safely when supplier conditions failed.

## What is still wrong

### Country handling gaps

- Most catalog rows still do not carry target-country truth.
- DB snapshot shows `withoutTargetCountry = 32638`.
- Older services can still rely on generic or legacy assumptions.

### Language handling gaps

- There is not yet strong end-to-end proof that publication content is selected or translated safely by marketplace/country.
- Risk remains for:
  - hardcoded English to Spanish destinations
  - hardcoded Spanish to English destinations
  - mixed-language listing bodies
  - country-language mismatch not blocked before publish

### Currency handling gaps

- Destination currency mapping is still unsafe in some eBay contexts.
- Current code still allows non-US eBay countries to fall back to `USD` in cases that should be `EUR` or another site currency.
- UK mapping uses `UK` rather than ISO `GB`.
- Profit integrity outside narrow contexts therefore cannot be trusted.

### Publication policy gaps

There is no strong evidence of comprehensive policy handling for:
- eBay ES vs eBay US differences
- MercadoLibre site-specific publication rules
- returns/business policy requirements by site
- VAT/tax publication constraints
- title/description constraints by site/country
- restricted-category handling by country

## Country-by-country assessment

| Marketplace/site | Country | Language | Currency | Current status |
|---|---|---|---|---|
| MercadoLibre Chile | CL | Spanish | CLP | Best current modeled target, still blocked by product/supplier/fee reality |
| eBay US | US | English | USD | Best current operational marketplace, still not safe end-to-end |
| eBay ES | ES | Spanish | Should be EUR | Country partly modeled, currency integrity weak |
| eBay UK | GB | English | GBP | Partly modeled, but country code normalization is inconsistent |
| Amazon future countries | varies | varies | varies | Not operationally ready |

## Publication language audit

### Current state

- Language is known in context.
- Language is not yet strongly enforced as a publication gate.

### Risks

- Wrong-language listing publication
- Marketplace compliance issues
- weak conversion and customer trust
- operator confusion if the UI does not show destination language explicitly

### Required fix

A listing must store and display:
- `publicationLanguage`
- `contentSourceLanguage`
- `translationMethod`
- `translationVerified`

No publish should proceed when destination language is unresolved.

## Currency / FX integrity audit

### Current state

- Currency is partly modeled.
- FX and fee completeness are not globally reliable.

### Risks

- mixed-currency arithmetic
- stale or implicit FX conversions
- profit reported in a currency different from the supplier cost basis
- country-specific fee schedules not matched to listing currency

### Required fix

Every candidate listing must store:
- `supplierCurrency`
- `listingCurrency`
- `fxRateUsed`
- `fxSource`
- `fxTimestamp`
- `normalizedCostUsd` or other single audit currency
- `marketplaceFeeCurrency`
- `paymentFeeCurrency`

## International readiness verdict

Ivan Reseller has moved from generic marketplace logic toward a real international publication architecture.  
That is a meaningful and strategically important improvement.

But it is not yet internationally ready because:
- language safety is incomplete,
- currency safety is incomplete,
- site policy handling is incomplete,
- and the catalog still lacks validated international context at scale.
