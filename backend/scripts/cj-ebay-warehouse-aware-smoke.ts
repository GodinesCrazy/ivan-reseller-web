import 'dotenv/config';

import { createCjSupplierAdapter } from '../src/modules/cj-ebay/adapters/cj-supplier.adapter';

const SMOKE_USER_ID = Math.max(1, parseInt(process.env.CJ_SMOKE_USER_ID || '1', 10) || 1);
const SEARCH_KEYWORD = String(process.env.CJ_EBAY_WAREHOUSE_SMOKE_KEYWORD || 'wireless earbuds').trim();
const DEST_ZIP = String(process.env.CJ_EBAY_WAREHOUSE_SMOKE_ZIP || '90001').trim();
const SEARCH_PAGE_SIZE = 8;
const PRODUCT_SCAN_LIMIT = 6;
const VARIANT_SCAN_LIMIT = 4;

async function main(): Promise<void> {
  const adapter = createCjSupplierAdapter(SMOKE_USER_ID);
  const search = await adapter.searchProducts({
    keyword: SEARCH_KEYWORD,
    page: 1,
    pageSize: SEARCH_PAGE_SIZE,
  });

  const attempts: Array<Record<string, unknown>> = [];

  for (const item of search.slice(0, PRODUCT_SCAN_LIMIT)) {
    const productId = String(item.cjProductId || '').trim();
    if (!productId) continue;

    const detail = await adapter.getProductById(productId);
    const variants = detail.variants.filter((variant) => String(variant.cjVid || '').trim());
    if (!variants.length) {
      attempts.push({ productId, reason: 'no_variant_vid' });
      continue;
    }

    const variantIds = variants.map((variant) => String(variant.cjVid || '').trim()).filter(Boolean);
    const stockMap = await adapter.getStockForSkus(variantIds);
    const stockedVariants = variants
      .map((variant) => ({
        variant,
        liveStock: stockMap.get(String(variant.cjVid || '').trim()) || 0,
      }))
      .filter((entry) => entry.liveStock > 0)
      .sort((left, right) => right.liveStock - left.liveStock)
      .slice(0, VARIANT_SCAN_LIMIT);

    if (!stockedVariants.length) {
      attempts.push({ productId, reason: 'no_live_stock' });
      continue;
    }

    for (const entry of stockedVariants) {
      const variantId = String(entry.variant.cjVid || '').trim();
      try {
        const { quote, fulfillmentOrigin } = await adapter.quoteShippingToUsWarehouseAware({
          productId,
          variantId,
          quantity: 1,
          destPostalCode: DEST_ZIP,
        });

        console.log(
          JSON.stringify(
            {
              ok: true,
              keyword: SEARCH_KEYWORD,
              productId,
              variantId,
              liveStock: entry.liveStock,
              startCountryCode: quote.startCountryCode,
              fulfillmentOrigin,
              shippingUsd: quote.cost,
              serviceName: quote.method,
              freightEvidence: quote.warehouseEvidence,
              searchHits: search.length,
            },
            null,
            2
          )
        );
        return;
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
        attempts.push({
          productId,
          variantId,
          liveStock: entry.liveStock,
          reason: code || (error instanceof Error ? error.message : String(error)),
        });
      }
    }
  }

  console.error(
    JSON.stringify(
      {
        ok: false,
        keyword: SEARCH_KEYWORD,
        destPostalCode: DEST_ZIP,
        searchHits: search.length,
        attempts,
      },
      null,
      2
    )
  );
  process.exit(1);
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        keyword: SEARCH_KEYWORD,
        fatal: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
