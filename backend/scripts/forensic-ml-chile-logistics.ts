import '../src/config/env';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import type { AliExpressDropshippingCredentials } from '../src/types/api-credentials.types';
import {
  aliexpressDropshippingAPIService,
  refreshAliExpressDropshippingToken,
} from '../src/services/aliexpress-dropshipping-api.service';
import {
  normalizeAliExpressShippingMethods,
  summarizeAliExpressLogisticsForensics,
} from '../src/utils/aliexpress-logistics-normalizer';
import { evaluateMlChileDiscoveryAdmission } from '../src/utils/ml-chile-discovery-admission';
import { evaluateMlChileSkuAdmission } from '../src/utils/ml-chile-cl-sku-admission';

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

async function main() {
  const userId = Number(process.argv[2] || 1);

  const creds = (await CredentialsManager.getCredentials(
    userId,
    'aliexpress-dropshipping',
    'production',
  )) as AliExpressDropshippingCredentials | null;

  const resolvedCreds =
    creds?.accessToken
      ? creds
      : ((await refreshAliExpressDropshippingToken(userId, 'production')).credentials as
          | AliExpressDropshippingCredentials
          | null);

  if (!resolvedCreds?.accessToken) {
    throw new Error('AliExpress Dropshipping production credentials are required for logistics forensics.');
  }

  aliexpressDropshippingAPIService.setCredentials(resolvedCreds);

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
    const logisticsSummary = summarizeAliExpressLogisticsForensics(product);
    const normalizedShippingMethods = normalizeAliExpressShippingMethods(product);
    const normalizedInfo = await aliexpressDropshippingAPIService.getProductInfo(sample.productId, {
      localCountry: 'CL',
      localLanguage: 'es',
    });

    rows.push({
      ...sample,
      logisticsSummary,
      normalizedShippingMethodCount: normalizedShippingMethods.length,
      normalizedShippingMethods: normalizedShippingMethods.slice(0, 5),
      logisticsInfoDtoPreview: product?.logistics_info_dto ?? null,
      discoveryAdmission: evaluateMlChileDiscoveryAdmission(normalizedInfo),
      skuAdmission: evaluateMlChileSkuAdmission(normalizedInfo),
    });
  }

  const categorySummary: Record<
    string,
    {
      samples: number;
      withLogisticsInfoDto: number;
      withNormalizedShippingMethods: number;
      admittedAfterDiscoveryGate: number;
    }
  > = {};

  for (const row of rows) {
    categorySummary[row.category] ??= {
      samples: 0,
      withLogisticsInfoDto: 0,
      withNormalizedShippingMethods: 0,
      admittedAfterDiscoveryGate: 0,
    };
    categorySummary[row.category].samples += 1;
    if (row.logisticsSummary.hasLogisticsInfoDto) categorySummary[row.category].withLogisticsInfoDto += 1;
    if (row.normalizedShippingMethodCount > 0) categorySummary[row.category].withNormalizedShippingMethods += 1;
    if (row.discoveryAdmission.admitted) categorySummary[row.category].admittedAfterDiscoveryGate += 1;
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        userId,
        sampleCount: rows.length,
        rows,
        categorySummary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[forensic-ml-chile-logistics] failed', error);
  process.exit(1);
});
