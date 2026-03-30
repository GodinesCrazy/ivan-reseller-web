# Opportunities — exact vs estimated contract

Backend returns `commercialTruth` on each `OpportunityItem` (see `opportunity-finder.types.ts`). The UI uses it as the **source of truth** for badges; `estimatedFields` remains for backward compatibility with older cached responses.

## Field meanings

| Field | `exact` | `estimated` | `unavailable` |
|--------|---------|-------------|----------------|
| `sourceCost` | AliExpress affiliate (or normalized) unit cost used | — | — |
| `suggestedPrice` | Derived from **real comparable listings** (median/mean competitive price from at least one marketplace with `listingsFound > 0`) | Heuristic markup (e.g. ×1.45) when **no** comparables | — |
| `profitMargin` / `roi` | Computed from `suggestedPrice` and landed cost when suggested price is exact | Same when suggested price is estimated | — |
| `competitionLevel` | Based on count of comparable listings for the winning marketplace | — | No comparables |

## `competitionSources`

String tokens indicating **how** comparables were obtained:

- `mercadolibre_public_catalog` — Mercado Libre public site search (no seller OAuth).
- `ebay_browse_application_token` — eBay Browse API using **client credentials** token.
- `ebay_browse_user_oauth` — Browse API using the user’s OAuth access/refresh path.
- `amazon_catalog` — Amazon search path (still requires configured SP/catalog credentials).

These are **not** a guarantee of seller account health; they describe **price discovery** only.

## Operator interpretation

- **Real** badge (UI) when `commercialTruth.suggestedPrice === 'exact'`.
- **Estimado** when comparables could not be fetched for that title/region combination.
- AliExpress OAuth fixes **supplier** data; it does not replace marketplace comparables. ML OAuth is **not** required for ML public comparables.
