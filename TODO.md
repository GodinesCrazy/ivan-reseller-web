# TODO: E2E Opportunities → Import → Products Flow Fix

## Current Progress
- [x] SECTION 1: Architecture audit complete
- [x] Plan approved by user

## Implementation Steps

### 1. Frontend: Professional duplicate handling
- [ ] frontend/src/services/products.api.ts: Catch 409 → return structured {isDuplicate: true, existingProductId, title, status}
- [ ] Opportunities UI (RealOpportunityDashboard/AIOpportunityFinder): Show "Ya existe #ID: TITLE" + buttons "Abrir existente" / "Ir a Products"

### 2. Backend: Post-import enrichment
- [ ] backend/src/services/product.service.ts: After createProduct, async enrich (aliExpressSupplierAdapter.getSku/shipping, update aliexpressSku/shippingCost)
- [ ] Trigger reconcileProductTruth after enrich

### 3. UI Improvements
- [ ] Products.tsx: Enhance blockedReasons display (next actions)
- [ ] Opportunities: "ESTIMADO" labels for computed vs scraped values

### 4. Routes/dependent
- [ ] backend/src/api/routes/products.routes.ts: Ensure create passes importSource='opportunity_search'

### 5. Testing & Deploy
- [ ] Local test: import fresh → check sku/shipping populated, no block
- [ ] Duplicate test: import same URL → professional UI
- [ ] Deploy Railway backend, Vercel frontend
- [ ] Live browser verify

## Status Checkpoints
- [] Duplicate handled professionally
- [] Imports preserve truth, auto-enrich sku/shipping/fees
- [] No more degraded LEGACY_UNVERIFIED imports
- [] Production runtime verified
