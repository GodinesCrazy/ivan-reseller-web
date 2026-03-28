# Opportunities — runtime mismatch analysis

## Live symptom (production)

- Search (e.g. «soporte celular») still felt **capped at ~10** results.
- Repeating Search showed the **same first batch**.
- No practical way to browse beyond the first slice.

## Code vs production — likely mismatches

| Cause | Effect |
|--------|--------|
| **Backend not redeployed** | Old `findOpportunities` still enforced `maxItems ≤ 10` and always used Affiliate `page_no=1`. |
| **Frontend not redeployed** | Old UI capped `maxItems` at 10 and sent no `page`. |
| **AliExpress ~10 SKUs per provider page** | Even with `page_size=20`, some responses return ~10 rows; a single provider page looks like a hard cap. |
| **Redis cache** | Without `page` in the cache key (pre-fix) or ignoring `refresh`, the same payload could repeat. |
| **Query typing** | Some proxies send `page`/`maxItems` as numbers or duplicated keys; strict `z.string()` parsing could mis-validate (now coerced). |

## Runtime path (canonical)

| Layer | Location |
|--------|-----------|
| UI | `frontend/src/pages/Opportunities.tsx` → `GET /api/opportunities` |
| API | `backend/src/api/routes/opportunities.routes.ts` |
| Search | `backend/src/services/opportunity-finder.service.ts` → AliExpress Affiliate `searchProducts` |
| Provider cap | `backend/src/services/aliexpress-affiliate-api.service.ts` (`page_size` ≤ 20) |

## Fix applied in this iteration

1. **Multi–provider-page merge per UI page** in `opportunity-finder` (default **2** Affiliate `page_no` steps per UI `page`, configurable via `OPPORTUNITY_AFFILIATE_PROVIDER_PAGES_PER_UI`).
2. **`refresh=1`** on Search from the form → **skip Redis read** for that request.
3. **`Cache-Control: private, no-store`** on JSON responses.
4. **Robust query parsing** (scalar/array/number) for `page` and `maxItems`.
5. **URL state** `?q=&page=&size=` so pagination survives reload and is easy to verify in production.
