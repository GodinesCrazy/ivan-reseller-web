# P67 — Real image-source enrichment

**Product:** `32690` · **AliExpress id (from URL):** `1005010297651726`

## Commands

```bash
cd backend
npm run type-check
npx tsx scripts/p66-enrich-product-images.ts 32690
```

## P67 run outcome

| Metric | Value |
|--------|--------|
| `imageCountBefore` | **1** |
| `imageCountAfter` | **1** |
| `dbUpdated` | **false** |
| `enrichPath` | **`no_dropshipping_credentials;affiliate_not_configured`** |
| `secondAngleNormDistinctFromFirst` | **false** |

**Existing URL (unchanged):**  
`https://ae-pic-a1.aliexpress-media.com/kf/Sd63839aaf0834ce88fe4e594b8e2f590M.jpg`

**URLs merged from APIs:** none (no dropshipping session; affiliate not configured).

## Classification

**`blocked_by_credentials`** — see `docs/P67_ALIEXPRESS_CREDENTIAL_RECOVERY_FOR_IMAGE_ENRICHMENT.md`.

Not applicable in this run: `second_angle_recovered`, `more_images_recovered_but_not_distinct_enough`, `blocked_by_supplier_data` (APIs never returned a product payload).

## Code change (enables retry after creds)

`p66-enrich-product-images.ts` now tries **Affiliate** `productdetail` + SKU images when Dropshipping is missing or returns zero URLs, and dedupes by **normalized URL** (scheme/host/path, no query).
