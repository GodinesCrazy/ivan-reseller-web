# Ivan Reseller — Phase 48: Smart Supplier Selector for Manual Fulfillment

See implementation: `backend/src/services/smart-supplier-selector.service.ts`, routes `GET/POST /api/orders/:id/smart-supplier*`.

- Optimized English query (max 6 words), Affiliate search + optional product detail enrichment
- Filters: title similarity ≥60%, required keywords from query, rating ≥4.5, orders ≥10, price ≤ supplier baseline +20%
- Validates with Dropshipping `getProductInfo` (SKU + stock)
- Returns one ranked pick; optional persist `recommendedSupplierUrl` + `recommendedSupplierMeta`
