# Publisher pending actions — final verdict

## Verdict

**PRODUCTION_UI_FIXED_AND_VISIBLE** (after explicit **Vercel production deploy** from current repo state).

## What was wrong

- **Code on `main` was correct** (`IntelligentPublisher.tsx` + publisher routes).
- **Vercel production was serving an older build** (hashed assets `index-DWYvvaS5.js` + `IntelligentPublisher-Ogu6rYH1.js` without reject/remove strings).

## What fixed it

- **`npx vercel deploy --prod --yes`** linked to project `ivan-martys-projects/ivan-reseller-web`, which rebuilt the frontend and promoted it to **`ivanreseller.com`** / **`www.ivanreseller.com`**.

## Honest caveats

- **Railway backend commit SHA** was not pulled from Railway’s dashboard/API; route existence was inferred via **401** on `POST .../pending/reject/1`.
- Browsers may need a **hard refresh** once to drop an old immutable chunk.

## Prevent recurrence

- Confirm **automatic production deploy** on push to `main` in Vercel, or document that **manual `vercel deploy --prod`** is required after merges.
