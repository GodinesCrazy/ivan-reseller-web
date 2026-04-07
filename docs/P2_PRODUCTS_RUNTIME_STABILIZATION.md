# P2 Products Runtime Stabilization

## Problem

`/api/products` was still falling into the global timeout middleware degraded response under the frozen catalog.

## Root Causes

Two real bottlenecks were identified:

1. setup-check for non-admin flows still depended on live API status computation
2. `productService.getProducts(...)` spent too much time on catalog-wide Prisma aggregations, especially category distinct logic

Direct service measurement before the optimization showed about `5165 ms`.

## Implemented Fix

- `setup-check.ts` now reads configuration truth directly from DB credentials
- `product.service.ts` list query was slimmed to only required fields
- related listing selection was capped for list view
- expensive aggregations were rewritten to faster SQL:
  - status counts
  - distinct categories

## Real Verification

Local source-backed HTTP result:

- `GET /api/products?limit=5&page=1`
- status `200`
- duration about `1348 ms`
- no `_degraded`
- no `_timeout`

Returned real truth includes:

- `count = 5`
- `pagination.total = 32650`
- `aggregations.byStatus.LEGACY_UNVERIFIED = 31875`
- `aggregations.byStatus.PENDING = 772`
- `aggregations.byStatus.REJECTED = 3`

## Outcome

The products endpoint is now operationally usable again under the frozen catalog and preserves the validated/blocked truth model.

