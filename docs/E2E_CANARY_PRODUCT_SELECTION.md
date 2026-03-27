# E2E — Canary product selection

## Strategy

Do **not** anchor the first real cycle on a single hard SKU (e.g. known image-automation limits). Prefer:

- Status **`VALIDATED_READY`**
- **`publishAllowed: true`** on ML preflight
- **`canary.tier === recommended`** (or highest **score** among acceptable)
- Positive **net profit** in `canonicalPricing` when `ok: true`
- **Webhook + connector** as green as possible (`postsale` section)

## Implementation

1. **`computeMercadoLibreCanaryAssessment`** — in `mercadolibre-publish-preflight.service.ts`; embedded in every preflight response as **`canary`**: `{ tier, score, reasons }`.
2. **`GET /api/products/canary/mlc`** — scans up to `scanCap` recent `VALIDATED_READY` products for the **logged-in user**, runs full preflight on each (costly — keep limits modest), returns sorted rows.
3. **UI** — Products page → open **“Canary publicación Mercado Libre (Chile)”** → pick top row with `publishAllowed` → **Preview ML**.

## Multi-tenant note

Candidates are **filtered by `userId = logged-in user`** so Mercado Libre OAuth credentials and on-disk asset packs match the product owner.

## SKU 32714

Use only as a **regression / stress** case for image automation — **not** as the default canary pick unless preflight says it is green.
