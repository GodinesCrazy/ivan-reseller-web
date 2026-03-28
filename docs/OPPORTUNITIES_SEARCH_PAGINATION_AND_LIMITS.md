# Opportunities search — pagination and limits

## API: `GET /api/opportunities`

| Query param | Default | Valid range | Meaning |
|-------------|---------|-------------|---------|
| `query` | — | non-empty to search | Search keywords |
| `maxItems` | 20 | 1–20 | Page size (per provider request) |
| `page` | 1 | 1–500 | 1-based index passed to AliExpress Affiliate as `page_no` |
| `marketplaces` | csv | — | Unchanged |
| `region` | `us` | — | Unchanged |

## Response shape (added)

```json
{
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "returned": 20,
    "mayHaveMore": true
  }
}
```

- **`mayHaveMore`**: `returned >= pageSize` (heuristic: full page ⇒ likely another page). Not a guaranteed total count (Affiliate API does not always expose totals in our integration).

## Provider constraints

- **AliExpress Affiliate** (`aliexpress.affiliate.product.query`): `page_size` ≤ **20** (enforced in `aliexpress-affiliate-api.service.ts`).
- **Opportunity finder** normalizes with `normalizeOpportunityPagination` in `backend/src/utils/opportunity-search-pagination.ts`.

## Cache

Cache key includes `page` and `pageSize` (`maxItems`), e.g. `...:p2:sz20:...`, so different pages do not collide.

## Research endpoint

`GET /api/opportunities/research` accepts the same pagination idea: `page` + `maxItems` (1–20) and returns `pagination` in the JSON body.
