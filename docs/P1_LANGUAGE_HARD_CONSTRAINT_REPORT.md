# P1 Language Hard Constraint Report

## Implemented

- Added explicit language policy resolution in `listing-language-policy.service.ts`.
- Supported publish-safe language contexts:
  - `MercadoLibre Chile -> es`
  - `eBay US -> en`
  - `eBay GB -> en`
  - `eBay ES -> es`
- Unsupported contexts now fail closed:
  - `eBay DE`
  - `eBay FR`
  - `eBay IT`
  - any unresolved marketplace/country/language context

## Enforcement points

- `marketplace-context.service.ts`
- `pre-publish-validator.service.ts`

## Result

- No publish-safe preparation can proceed if:
  - destination country is unresolved
  - currency is unresolved
  - language is unresolved
  - language is unsupported for the marketplace/country

## Regression proof

- `listing-language-policy.service.test.ts` passed.
