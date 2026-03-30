# Opportunities duplicate import — runtime fix

## Problem

`POST /api/products` returns **409** when the same user already has a product with the same AliExpress URL (`ProductService.createProduct` duplicate guard). The error handler exposed a plain string `error` but **no structured fields** for the UI to branch on.

## Backend changes

| File | Change |
|------|--------|
| `backend/src/services/product.service.ts` | `AppError` with `statusCode` 409, `ErrorCode.RESOURCE_CONFLICT`, and `details`: `existingProductId`, `existingProductTitle`, `existingProductStatus`, `duplicateBy: 'aliexpress_url'`. |
| `backend/src/middleware/error.middleware.ts` | For operational errors whose `details` include `existingProductId` + `duplicateBy`, also echo **top-level** `existingProductId`, `existingProductTitle`, `existingProductStatus`, `duplicateBy` on the JSON body (alongside `details`). |

## Response shape (409)

```json
{
  "success": false,
  "error": "<mensaje operativo>",
  "errorCode": "RESOURCE_CONFLICT",
  "existingProductId": 123,
  "existingProductTitle": "...",
  "existingProductStatus": "PENDING",
  "duplicateBy": "aliexpress_url",
  "details": { ... }
}
```

## Tests

`backend/src/__tests__/services/product.service.test.ts` — `rejects with 409 RESOURCE_CONFLICT when AliExpress URL already exists`.
