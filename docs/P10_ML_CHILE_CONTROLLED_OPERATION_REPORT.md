# P10 ML Chile Controlled Operation Report

Date: 2026-03-21

## Lead-Path Reassessment

MercadoLibre Chile is the correct strategic lead path for the first controlled operation, but it is not yet operationally ready.

Why it is the right lead path:

- Chile allows direct coordination with a trusted buyer
- post-sale truth and delivery observation are easier to verify locally
- released-funds behavior can be observed more deliberately than on the previous lead path

Why it is not ready yet:

- live runtime still shows MercadoLibre order sync failing with `401 invalid access token`
- live ML Chile readiness diagnostic for user `1` shows:
  - active MercadoLibre production credential count = `1`
  - products with `targetCountry = CL` in scanned set = `0`
  - strict ML Chile ready candidates = `0`
  - MercadoLibre sales = `0`
  - MercadoLibre orders = `0`

## ML Chile Suitability Matrix

| Area | Current maturity | Evidence |
| --- | --- | --- |
| Auth maturity | Runtime-partial to broken | credential exists, but runtime logs still show `401 invalid access token` |
| Listing readiness | Broken | zero strict ML Chile ready candidates |
| Fee modeling for Chile | Runtime-partial, improved in this sprint | ML fee model exists; this sprint corrected fixed CLP fee handling |
| Currency handling | Operationally usable in code | destination service resolves `MLC -> CLP`, pre-publish uses marketplace currency context |
| Shipping / destination logic for Chile | Code-strong, runtime-weak | validator supports destination-first checks, but no product persists `CL` target truth |
| Order ingestion | Code-only to runtime-partial | architecture exists, but zero ML orders in current evidence |
| Webhook / notifications | Partial | marketplace sync exists, but current auth blocks live proof |
| Post-sale visibility | Partial | sales/order truth model exists, but no ML operation exists to observe |
| Released-funds observability | Code-only to runtime-partial | sales/payout models exist, but zero ML released-funds proof |

## Comparison Against eBay For Lead-Path Choice

eBay still has stronger historical integration proof, but it is not the best first controlled validation path because the buyer-control advantage is now in Chile.

MercadoLibre Chile is the better lead path strategically.
It is not the healthier runtime path today.

## Exact First Blockers

1. MercadoLibre auth still fails with `401 invalid access token`
2. zero products persist `targetCountry = CL`
3. zero strict `VALIDATED_READY` candidates exist for ML Chile
4. zero ML sales and zero ML orders exist
5. supplier-side payment completion remains unproven
6. released-funds and realized-profit proof remain absent
