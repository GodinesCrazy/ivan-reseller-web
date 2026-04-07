# P89 — Web preflight UI surface

## Location

`frontend/src/pages/ProductPreview.tsx` — sidebar card **“Pre-publicación (backend)”** when `?marketplace=mercadolibre` (or default marketplace ML in preview).

## Data source

- **Only** `GET /api/products/:id/publish-preflight` — no client-side fee math.

## Displayed truth

- `overallState`, `publishAllowed`  
- Listing USD price used for validation  
- Canonical pricing failure reasons when `canonicalPricing.ok === false`  
- Image `publishSafe` + blocking reason  
- Post-sale: webhook secret configured (env), event flow ready (proof service)  
- Full `blockers`, `warnings`, `nextAction`

## Fail-closed CTA

- **“Publicar”** (send to Intelligent Publisher) is **disabled** when `publishAllowed === false` for Mercado Libre preview.

**Note:** Direct publish via `POST /api/marketplace/publish` is still gated by backend rules; the UI preflight is aligned but not the only entry point.
