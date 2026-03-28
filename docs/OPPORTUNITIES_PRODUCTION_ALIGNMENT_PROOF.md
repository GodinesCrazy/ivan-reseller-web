# Opportunities — production alignment proof

## What “fixed” means in production

1. **Backend** deployed with:
   - multi-step Affiliate merge per UI page,
   - `page` + `maxItems` honored,
   - optional `refresh` skipping Redis,
   - `Cache-Control: private, no-store`.

2. **Frontend** deployed with:
   - `page` / `maxItems` / `refresh` on Search,
   - URL sync,
   - visible **Anterior / Siguiente**.

## How to verify (live)

1. Open `/opportunities?q=soporte+celular&page=1&size=20` (adjust host).
2. Confirm **up to ~20 rows** on the first UI page when the provider returns enough SKUs (may be fewer if the catalog is thin).
3. Click **Siguiente**; URL `page` increments; **titles/IDs should change** vs page 1 (unless the catalog repeats — rare).
4. Click **Search** again with the same term; with `refresh=1`, Redis is bypassed for that request (network tab shows `refresh=1`).
5. Response headers include **`Cache-Control: private, no-store`**.

## Deployment checklist

| Surface | Action |
|---------|--------|
| Railway (API) | Deploy commit that includes `opportunity-finder` merge + route changes |
| Vercel (web) | Deploy commit that includes `Opportunities.tsx` changes |

## If production still looks capped

- Confirm **Network** tab: requests include `page=2` on Next and `maxItems=20`.
- Confirm response **JSON** `pagination.page` matches the requested page.
- If the API is old, `page` may be ignored — redeploy **backend** first.
