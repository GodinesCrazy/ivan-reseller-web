# P91 — Tests and validation

## Executed

| Check | Result |
|--------|--------|
| `backend` `npm run type-check` | **PASS** (exit 0) |
| URL → productId for `https://es.aliexpress.com/item/1005009130509159.html` | **PASS** (`1005009130509159`, same regex as `aliexpress-supplier.adapter.ts`) |
| Repo grep for `1005009130509159` | **No matches** (no baked-in fixture) |

## Not executed (explicit)

- `POST /api/products` (no DB write)  
- `GET /api/products/:id/publish-preflight` (no id)  
- `POST /api/marketplace/publish`  
- Live webhook HTTP exercise  
- `fulfillOrder` / internal test-post-sale for this SKU  
- AliExpress Dropshipping `getProductInfo` for gray sku resolution  

## Proven vs inspected

| Proven | Inspected only |
|--------|----------------|
| Adapter extracts correct AE id from chosen URL | Webhook + fulfill + preflight **implementation** paths in repo |
