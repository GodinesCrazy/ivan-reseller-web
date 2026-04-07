# P99 — Tests and validation

## TypeScript

```bash
cd backend
npm run type-check
```

**Result:** `tsc --noEmit` exited **0** after the `marketplace.service.ts` change and addition of `scripts/p99-controlled-publish-32714.ts`.

## Runtime (publish flow)

- **Script:** `npx tsx scripts/p99-controlled-publish-32714.ts` (from `backend/`, with production `DATABASE_URL` and ML credentials loaded via `dotenv`).
- **Outcome:** Successful publish on second execution (after local-image parsing fix); artifact `p99-publish-result.json` at repo root.

## Focused checks performed by the script

- `buildMercadoLibrePublishPreflight` pre-publish recheck.
- `publishProduct` end-to-end.
- Post-publish: latest `marketplace_listings` row, `products` row subset.
- Optional: GET `https://api.mercadolibre.com/items/{listingId}` + `MercadoLibreService.getItemStatus`.

No full `npm test` suite was required for P99 closure; scope was type-check plus the controlled publish run above.
