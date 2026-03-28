# Vercel frontend — deploy verification

## Production URL (documented in repo)

`https://ivan-reseller-web.vercel.app`

## Asset fingerprint check (HTTP)

Vite emits hashed entry assets. Comparing **live** `index.html` vs a **local** `npm run build` from `main` at `99766fb`:

| Source | Entry script | Entry CSS |
|--------|----------------|-----------|
| **Live Vercel** (sample fetch) | `/assets/index-txt1s9KR.js` | `/assets/index-C2CJxCcL.css` |
| **Local build** (`99766fb`) | `/assets/index-CiVVXKXt.js` | `/assets/index-BI8lM2P0.css` |

**Mismatch** → the Vercel deployment that served this HTML is **not** the same build artifact as current `main` at verification time.

## Action required

Redeploy the Vercel **Production** deployment from `main` (commit `99766fb` or later) and re-fetch `index.html` until entry chunk names align with the latest build (or use Vercel Deployment “View Source” / Git SHA in dashboard).

## Why this matters for import

Even with backend fixed, an **old** SPA bundle may omit `importSource` / `aliExpressItemId` on `POST /api/products` or miss the delete modal UX. Backend `shouldEnrichOpportunityImport` also keys off persisted `productData` and `aliExpressItemId`; keeping frontend on `main` removes ambiguity.
