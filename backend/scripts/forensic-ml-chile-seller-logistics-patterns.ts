import '../src/lib/env-validation';

import fs from 'node:fs';
import path from 'node:path';

import { aliexpressDropshippingAPIService } from '../src/services/aliexpress-dropshipping-api.service';
import { buildMlChileSellerLogisticsPattern } from '../src/utils/ml-chile-seller-logistics-pattern';

type SampleCandidate = {
  productId: string;
  query: string;
  category: string;
};

const SAMPLE_CANDIDATES: SampleCandidate[] = [
  { productId: '1005011570887780', query: 'washi tape', category: 'stationery_small' },
  { productId: '1005007817537666', query: 'washi tape', category: 'stationery_small' },
  { productId: '1005010648079934', query: 'washi tape', category: 'stationery_small' },
  { productId: '1005007930068985', query: 'washi tape', category: 'stationery_small' },
  { productId: '1005010676236846', query: 'hair clip', category: 'light_accessories' },
  { productId: '1005009352853460', query: 'washi tape', category: 'stationery_small' },
  { productId: '1005009637732287', query: 'washi tape', category: 'stationery_small' },
  { productId: '1005006572993481', query: 'washi tape', category: 'stationery_small' },
  { productId: '1005011782695392', query: 'washi tape', category: 'stationery_small' },
  { productId: '1005010091696441', query: 'washi tape', category: 'stationery_small' },
  { productId: '1005008058492595', query: 'washi tape', category: 'stationery_small' },
  { productId: '1005006756440470', query: 'washi tape', category: 'stationery_small' },
  { productId: '1005010397566719', query: 'washi tape', category: 'stationery_small' },
  { productId: '1005010262460636', query: 'hair clip', category: 'light_accessories' },
  { productId: '1005010249381437', query: 'hair clip', category: 'light_accessories' },
  { productId: '1005010546288724', query: 'nail sticker', category: 'beauty_small' },
  { productId: '1005010173250657', query: 'phone lanyard', category: 'light_accessories' },
  { productId: '1005011785307519', query: 'phone lanyard', category: 'light_accessories' },
  { productId: '1005010801515605', query: 'phone lanyard', category: 'light_accessories' },
  { productId: '1005010346129704', query: 'phone lanyard', category: 'light_accessories' },
  { productId: '1005010784427692', query: 'phone lanyard', category: 'light_accessories' },
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

async function main(): Promise<void> {
  const userId = Number(process.argv[2] ?? '1');
  const rows: Array<Record<string, unknown>> = [];
  const classificationSummary: Record<string, number> = {};
  const sellerSummary: Record<string, number> = {};

  for (const sample of SAMPLE_CANDIDATES) {
    const info = await aliexpressDropshippingAPIService.getProductInfo(sample.productId, 'CL');
    const rawResponse = await (aliexpressDropshippingAPIService as any).makeRequest(
      'aliexpress.ds.product.get',
      { product_id: sample.productId },
    );

    const rawProduct =
      findFirstRecordWithKey(rawResponse, 'ae_store_info') ??
      findFirstRecordWithKey(rawResponse, 'logistics_info_dto') ??
      findFirstRecordWithKey(rawResponse, 'package_info_dto');
    const rawLogisticsInfoDto = rawProduct?.logistics_info_dto ?? null;
    const shippingMethods = Array.isArray((info as any)?.shippingMethods)
      ? ((info as any).shippingMethods as unknown[])
      : [];

    const pattern = buildMlChileSellerLogisticsPattern({
      rawProduct,
      rawLogisticsInfoDto,
      shippingMethods,
    });

    classificationSummary[pattern.classification] =
      (classificationSummary[pattern.classification] ?? 0) + 1;
    sellerSummary[pattern.sellerKey] = (sellerSummary[pattern.sellerKey] ?? 0) + 1;

    rows.push({
      productId: sample.productId,
      query: sample.query,
      category: sample.category,
      pattern,
    });
  }

  const result = {
    generatedAt: new Date().toISOString(),
    userId,
    sampleCount: SAMPLE_CANDIDATES.length,
    classificationSummary,
    sellerSummary,
    rows,
  };

  const outputDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'p19-seller-logistics-patterns.json'),
    JSON.stringify(result, null, 2),
    'utf8',
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const result = {
    script: 'forensic-ml-chile-seller-logistics-patterns',
    error: error instanceof Error ? error.message : String(error),
  };
  const outputDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'p19-seller-logistics-patterns.json'),
    JSON.stringify(result, null, 2),
    'utf8',
  );
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
});
