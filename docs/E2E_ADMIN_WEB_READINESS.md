# E2E — Admin web readiness

## Authentication

- Cookie/header JWT; role `ADMIN` unlocks extra dashboard APIs (see `Dashboard.tsx`, `Sidebar.tsx`).
- Setup gate may block non-admin until onboarding (`setup_required` on product list).

## Truthful readiness surfaces

| Surface | What it shows | Honesty notes |
|---------|---------------|---------------|
| ML preflight | `overallState`, `publishAllowed`, blockers, pricing, images, postsale | Same contract for UI and API; publish button **disabled** when `publishAllowed === false` on ML preview. |
| Canary panel (Products) | Ranked `VALIDATED_READY` products with tier/score | Heuristic on top of preflight; does **not** relax gates. |
| Product preview — canary box | `tier` + `score` | Explains it is E2E heuristic. |
| Post-sale overview card | Listings + last order / fulfillment status | Depends on data existing in DB. |
| Operations truth | Per-product operational hints | Loaded in batch on product grid. |

## Gaps / caveats

- **Products → quick publish** (`handlePublish`) still defaults `marketplaces: ['ebay']` in one path — for **ML canary** use **preview with `marketplace=mercadolibre`** and Intelligent Publisher / marketplace publish flow documented in operation plan.
- **Profitability** in list view uses simplified fields (`estimatedUnitMargin`); **canonical** profit is in preflight `canonicalPricing` for ML.

## Changes in this audit

- **Canary Mercado Libre** card on **Products** + API `GET /api/products/canary/mlc`.
- **ProductPreview** shows **canary** block when preflight returns `canary`.
