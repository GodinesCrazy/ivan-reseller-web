import '../src/lib/env-validation';

import { aliexpressDropshippingAPIService } from '../src/services/aliexpress-dropshipping-api.service';
import { evaluateMlChileShippingGate } from '../src/utils/ml-chile-shipping-gate';

type SampleCandidate = {
  productId: string;
  query: string;
  category: string;
};

const SAMPLE_CANDIDATES: SampleCandidate[] = [
  { productId: '1005010571002222', query: 'cable organizer', category: 'desk_organization' },
  { productId: '1005008644832335', query: 'adhesive hook', category: 'home_storage' },
  { productId: '1005010777611498', query: 'drawer organizer', category: 'home_storage' },
  { productId: '1005011866145227', query: 'desk organizer', category: 'desk_organization' },
  { productId: '1005011814680927', query: 'kitchen organizer', category: 'kitchen_storage' },
  { productId: '1005010491758049', query: 'storage basket', category: 'home_storage' },
  { productId: '1005011799401634', query: 'closet organizer', category: 'home_storage' },
  { productId: '1005011559787198', query: 'under shelf storage', category: 'kitchen_storage' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findFirstRecordWithKey(value: unknown, key: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstRecordWithKey(item, key);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (key in value) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findFirstRecordWithKey(child, key);
    if (found) {
      return found;
    }
  }

  return null;
}

function limitObject(value: unknown, depth = 0): unknown {
  if (depth >= 3) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => limitObject(item, depth + 1));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 12)
      .map(([key, child]) => [key, limitObject(child, depth + 1)]),
  );
}

function collectShippingKeyHints(value: unknown, acc = new Set<string>()): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectShippingKeyHints(item, acc);
    }
    return [...acc].sort();
  }

  if (!isRecord(value)) {
    return [...acc].sort();
  }

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.includes('ship') ||
      normalizedKey.includes('logistic') ||
      normalizedKey.includes('freight') ||
      normalizedKey.includes('price') ||
      normalizedKey.includes('cost') ||
      normalizedKey.includes('fee') ||
      normalizedKey.includes('service') ||
      normalizedKey.includes('delivery')
    ) {
      acc.add(key);
    }
    collectShippingKeyHints(child, acc);
  }

  return [...acc].sort();
}

async function main(): Promise<void> {
  const userId = Number(process.argv[2] ?? '1');
  const rows: Array<Record<string, unknown>> = [];
  const shippingGateSummaryByCode: Record<string, number> = {};

  for (const sample of SAMPLE_CANDIDATES) {
    const info = await aliexpressDropshippingAPIService.getProductInfo(sample.productId, 'CL');
    const rawResponse = await (aliexpressDropshippingAPIService as any).makeRequest(
      'aliexpress.ds.product.get',
      { product_id: sample.productId },
    );

    const rawProduct =
      findFirstRecordWithKey(rawResponse, 'logistics_info_dto') ??
      findFirstRecordWithKey(rawResponse, 'ae_item_sku_info_dtos');
    const rawLogisticsInfoDto = rawProduct?.logistics_info_dto ?? null;
    const shippingMethods = Array.isArray((info as any)?.shippingMethods)
      ? ((info as any).shippingMethods as unknown[])
      : [];

    const shippingGate = evaluateMlChileShippingGate({
      shippingMethods,
      rawLogisticsInfoDto,
      rawProduct,
    });

    shippingGateSummaryByCode[shippingGate.code] =
      (shippingGateSummaryByCode[shippingGate.code] ?? 0) + 1;

    rows.push({
      productId: sample.productId,
      query: sample.query,
      category: sample.category,
      shippingGate,
      normalizedShippingMethodCount: shippingMethods.length,
      normalizedShippingMethodsPreview: limitObject(shippingMethods),
      logisticsInfoDtoKeys: isRecord(rawLogisticsInfoDto) ? Object.keys(rawLogisticsInfoDto) : [],
      logisticsInfoDtoPreview: limitObject(rawLogisticsInfoDto),
      shippingKeyHints: collectShippingKeyHints(rawLogisticsInfoDto),
    });
  }

  const admittedAfterShippingCostGate = rows.filter(
    (row) => isRecord(row.shippingGate) && row.shippingGate.admitted === true,
  ).length;

  const summary = {
    generatedAt: new Date().toISOString(),
    userId,
    sampleCount: SAMPLE_CANDIDATES.length,
    admittedAfterShippingCostGate,
    shippingGateSummaryByCode,
    rows,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
