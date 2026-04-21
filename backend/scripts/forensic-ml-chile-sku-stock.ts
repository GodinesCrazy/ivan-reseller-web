import '../src/config/env';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import type { AliExpressDropshippingCredentials } from '../src/types/api-credentials.types';
import {
  aliexpressDropshippingAPIService,
  refreshAliExpressDropshippingToken,
} from '../src/services/aliexpress-dropshipping-api.service';
import { normalizeAliExpressRawSkus } from '../src/utils/aliexpress-raw-sku-normalizer';
import { evaluateMlChileSkuAdmission } from '../src/utils/ml-chile-cl-sku-admission';
import { evaluateMlChileDiscoveryAdmission } from '../src/utils/ml-chile-discovery-admission';

const SAMPLE_SET = [
  { productId: '1005010571002222', query: 'cable organizer', category: 'desk_organization' },
  { productId: '1005008644832335', query: 'adhesive hook', category: 'home_storage' },
  { productId: '1005010777611498', query: 'drawer organizer', category: 'home_storage' },
  { productId: '1005011866145227', query: 'desk organizer', category: 'desk_organization' },
  { productId: '1005011814680927', query: 'kitchen organizer', category: 'kitchen_storage' },
  { productId: '1005010491758049', query: 'storage basket', category: 'home_storage' },
  { productId: '1005011799401634', query: 'closet organizer', category: 'home_storage' },
  { productId: '1005011559787198', query: 'under shelf storage', category: 'kitchen_storage' },
];

function pickInterestingRawFields(sku: Record<string, unknown>) {
  const interestingKeys = [
    'sku_id',
    'skuId',
    'id',
    'sku_available_stock',
    'stock',
    'available_stock',
    'inventory',
    'stock_quantity',
    'salable',
    'salable_stock',
    'is_salable',
    'sku_status',
    'status',
    'sku_attr',
    'sku_property_list',
    'offer_sale_price',
    'sale_price',
    'price',
    'currency_code',
  ];

  const result: Record<string, unknown> = {};
  for (const key of interestingKeys) {
    if (key in sku) result[key] = sku[key];
  }
  return result;
}

async function loadDsCredentials(userId: number) {
  const creds = (await CredentialsManager.getCredentials(
    userId,
    'aliexpress-dropshipping',
    'production',
  )) as AliExpressDropshippingCredentials | null;

  const resolved =
    creds?.accessToken
      ? creds
      : ((await refreshAliExpressDropshippingToken(userId, 'production')).credentials as
          | AliExpressDropshippingCredentials
          | null);

  if (!resolved?.accessToken) {
    throw new Error('AliExpress Dropshipping production credentials are required for CL SKU forensics.');
  }

  aliexpressDropshippingAPIService.setCredentials(resolved);
}

async function main() {
  const userId = Number(process.argv[2] || 1);
  await loadDsCredentials(userId);

  const rows = [];

  for (const sample of SAMPLE_SET) {
    const raw = await (aliexpressDropshippingAPIService as any).makeRequest('aliexpress.ds.product.get', {
      product_id: sample.productId,
      ship_to_country: 'CL',
      shipToCountry: 'CL',
      local_country: 'CL',
      local_language: 'es',
    });

    const product = raw?.result ?? raw?.product ?? raw;
    const normalizedInfo = await aliexpressDropshippingAPIService.getProductInfo(sample.productId, {
      localCountry: 'CL',
      localLanguage: 'es',
    });

    const rawSkuContainer =
      product?.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o ??
      product?.ae_item_sku_info_dtos?.ae_item_sku_info_dto ??
      product?.ae_item_sku_info_dtos ??
      [];
    const rawSkuRows = Array.isArray(rawSkuContainer) ? rawSkuContainer : [];
    const normalizedSkus = normalizeAliExpressRawSkus(product);

    rows.push({
      ...sample,
      productLevelStock: {
        stock: product?.stock ?? null,
        available_stock: product?.available_stock ?? null,
      },
      discoveryAdmission: evaluateMlChileDiscoveryAdmission(normalizedInfo),
      skuAdmission: evaluateMlChileSkuAdmission(normalizedInfo),
      infoSkuCount: normalizedInfo.skus?.length ?? 0,
      infoSkuPreview: (normalizedInfo.skus ?? []).slice(0, 5),
      rawSkuCount: rawSkuRows.length,
      normalizedSkuCount: normalizedSkus.length,
      rawSkuPreview: rawSkuRows.slice(0, 5).map((sku: Record<string, unknown>) => pickInterestingRawFields(sku)),
      normalizedSkuPreview: normalizedSkus.slice(0, 5),
      normalizedSkuSummary: normalizedSkus.map((sku) => ({
        skuId: sku.skuId,
        stock: sku.stock,
        salePrice: sku.salePrice,
        attributes: sku.attributes,
      })),
    });
  }

  const summary = {
    rows: rows.length,
    rawRowsWithSkuData: rows.filter((row) => row.rawSkuCount > 0).length,
    normalizedRowsWithSkuData: rows.filter((row) => row.normalizedSkuCount > 0).length,
    rowsWithAnyPositiveNormalizedStock: rows.filter((row) =>
      row.normalizedSkuSummary.some((sku) => Number(sku.stock || 0) > 0),
    ).length,
    rowsWithAnyPositiveRawStockField: rows.filter((row) =>
      row.rawSkuPreview.some((sku) =>
        ['sku_available_stock', 'stock', 'available_stock', 'inventory', 'stock_quantity', 'salable_stock'].some(
          (key) => Number((sku as Record<string, unknown>)[key] || 0) > 0,
        ),
      ),
    ).length,
  };

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        userId,
        summary,
        rows,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[forensic-ml-chile-sku-stock] failed', error);
  process.exit(1);
});
