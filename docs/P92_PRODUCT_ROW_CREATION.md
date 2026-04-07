# P92 — Product row creation

## Intended behavior

Script `backend/scripts/p92-staging-candidate-setup.ts` (after successful DS resolution):

- **Create** `Product` with `aliexpressUrl` = `https://www.aliexpress.com/item/1005009130509159.html`, `aliexpressSku` = resolved gray `skuId`, `targetCountry: 'CL'`, `originCountry: 'CN'`, prices from gray SKU, `images` JSON from DS `productImages`, `status: 'PENDING'`, `productData` marker `p92StagingCandidate`.  
- **Or update** existing row for same user if URL/productId already matches.

Uses **Prisma** directly (not `productService.createProduct`) to avoid duplicate URL guard firing on intentional re-runs and to set `aliexpressSku` in one step.

## Execution result (this sprint)

**NOT EXECUTED** — blocked upstream by **DS credentials** (see `P92_DS_PRODUCT_INFO_AND_GRAY_SKU_RESOLUTION.md`).

## internal productId

**None created** in this run.

## Exact next action

After DS resolution succeeds, re-run the script without `--resolve-only`; capture `internalProductId` from console and `artifacts/p92/p92-resolution.json`.
