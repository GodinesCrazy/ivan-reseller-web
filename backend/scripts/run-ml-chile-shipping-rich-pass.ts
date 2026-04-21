import '../src/lib/env-validation';

import { aliexpressAffiliateAPIService } from '../src/services/aliexpress-affiliate-api.service';
import { aliexpressDropshippingAPIService } from '../src/services/aliexpress-dropshipping-api.service';
import { evaluateMlChileDiscoveryAdmission } from '../src/utils/ml-chile-discovery-admission';
import { evaluateMlChileSkuAdmission } from '../src/utils/ml-chile-cl-sku-admission';
import { evaluateMlChileShippingGate } from '../src/utils/ml-chile-shipping-gate';
import {
  classifyMlChileShippingPattern,
  getMlChileShippingRichSeedQueries,
} from '../src/utils/ml-chile-shipping-rich-seed-strategy';

type UnknownRecord = Record<string, unknown>;

type ExtractedAffiliateCandidate = {
  productId: string;
  title: string;
  query: string;
  category: string;
  rating?: number | null;
  volume?: number | null;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function findFirstRecordWithKey(value: unknown, key: string): UnknownRecord | null {
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

function flattenRecords(value: unknown, acc: UnknownRecord[] = []): UnknownRecord[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenRecords(item, acc);
    }
    return acc;
  }

  if (!isRecord(value)) {
    return acc;
  }

  acc.push(value);
  for (const child of Object.values(value)) {
    flattenRecords(child, acc);
  }

  return acc;
}

function extractAffiliateCandidates(
  payload: unknown,
  query: string,
  category: string,
): ExtractedAffiliateCandidate[] {
  const records = flattenRecords(payload);
  const seen = new Set<string>();
  const results: ExtractedAffiliateCandidate[] = [];

  for (const record of records) {
    const rawProductId =
      record.productId ??
      record.product_id ??
      record.itemId ??
      record.item_id ??
      record.goods_id;

    const productId = rawProductId == null ? '' : String(rawProductId).trim();
    if (!productId || seen.has(productId)) {
      continue;
    }

    const rawTitle =
      record.productTitle ??
      record.product_title ??
      record.title ??
      record.subject ??
      record.productName ??
      record.product_name;

    if (rawTitle == null) {
      continue;
    }

    seen.add(productId);
    results.push({
      productId,
      title: String(rawTitle),
      query,
      category,
      rating:
        toFiniteNumber(record.evaluate_rate) ??
        toFiniteNumber(record.rating) ??
        toFiniteNumber(record.star_rating),
      volume:
        toFiniteNumber(record.lastest_volume) ??
        toFiniteNumber(record.volume) ??
        toFiniteNumber(record.orders),
    });
  }

  return results;
}

async function runAffiliateSearch(
  query: string,
  pageSize: number,
): Promise<unknown> {
  const service = aliexpressAffiliateAPIService as any;
  const candidateMethodNames = [
    'searchProducts',
    'searchAffiliateProducts',
    'searchProductsByKeyword',
    'searchByKeyword',
    'searchHotProducts',
  ];

  for (const methodName of candidateMethodNames) {
    const method = service?.[methodName];
    if (typeof method !== 'function') {
      continue;
    }

    const attempts: Array<unknown[]> = [
      [query, { shipToCountry: 'CL', pageSize }],
      [{ keywords: query, shipToCountry: 'CL', pageSize }],
      [{ query, shipToCountry: 'CL', pageSize }],
      [query, 'CL', pageSize],
      [query],
    ];

    for (const args of attempts) {
      try {
        const result = await method.apply(service, args);
        const extracted = extractAffiliateCandidates(result, query, 'unknown');
        if (extracted.length > 0) {
          return result;
        }
      } catch {
        continue;
      }
    }
  }

  throw new Error('No affiliate search method produced parseable candidates for the shipping-rich pass.');
}

async function main(): Promise<void> {
  const userId = Number(process.argv[2] ?? '1');
  const perQueryLimit = Number(process.argv[3] ?? '4');
  const seedQueries = getMlChileShippingRichSeedQueries();

  const scannedByQuery: Record<string, number> = {};
  const discoveryGateSummaryByCode: Record<string, number> = {};
  const clSkuGateSummaryByCode: Record<string, number> = {};
  const shippingGateSummaryByCode: Record<string, number> = {};
  const patternInventory: Record<string, Record<string, unknown>> = {};
  const rows: Array<Record<string, unknown>> = [];

  for (const seed of seedQueries) {
    const searchPayload = await runAffiliateSearch(seed.query, perQueryLimit);
    const rawCandidates = extractAffiliateCandidates(searchPayload, seed.query, seed.category).slice(
      0,
      perQueryLimit,
    );

    scannedByQuery[seed.query] = rawCandidates.length;

    let admittedAfterChileSupportGate = 0;
    let admittedAfterClSkuGate = 0;
    let admittedAfterShippingCostGate = 0;

    for (const candidate of rawCandidates) {
      const info = await aliexpressDropshippingAPIService.getProductInfo(candidate.productId, 'CL');
      const rawResponse = await (aliexpressDropshippingAPIService as any).makeRequest(
        'aliexpress.ds.product.get',
        { product_id: candidate.productId },
      );

      const rawProduct =
        findFirstRecordWithKey(rawResponse, 'logistics_info_dto') ??
        findFirstRecordWithKey(rawResponse, 'ae_item_sku_info_dtos');
      const rawLogisticsInfoDto = rawProduct?.logistics_info_dto ?? null;
      const shippingMethods = Array.isArray((info as any)?.shippingMethods)
        ? ((info as any).shippingMethods as unknown[])
        : [];

      const discoveryAdmission = evaluateMlChileDiscoveryAdmission(info as any);
      discoveryGateSummaryByCode[discoveryAdmission.code] =
        (discoveryGateSummaryByCode[discoveryAdmission.code] ?? 0) + 1;

      if (discoveryAdmission.admitted) {
        admittedAfterChileSupportGate += 1;
      }

      const skuAdmission = evaluateMlChileSkuAdmission(info as any);
      clSkuGateSummaryByCode[skuAdmission.code] =
        (clSkuGateSummaryByCode[skuAdmission.code] ?? 0) + 1;

      if (skuAdmission.admitted) {
        admittedAfterClSkuGate += 1;
      }

      const shippingGate = evaluateMlChileShippingGate({
        shippingMethods,
        rawLogisticsInfoDto,
        rawProduct,
      });
      shippingGateSummaryByCode[shippingGate.code] =
        (shippingGateSummaryByCode[shippingGate.code] ?? 0) + 1;

      if (discoveryAdmission.admitted && skuAdmission.admitted && shippingGate.admitted) {
        admittedAfterShippingCostGate += 1;
      }

      rows.push({
        ...candidate,
        discoveryAdmission,
        skuAdmission,
        shippingGate,
        normalizedShippingMethodCount: shippingMethods.length,
      });
    }

    patternInventory[seed.query] = {
      category: seed.category,
      rationale: seed.rationale,
      scanned: rawCandidates.length,
      admittedAfterChileSupportGate,
      admittedAfterClSkuGate,
      admittedAfterShippingCostGate,
      classification: classifyMlChileShippingPattern(admittedAfterShippingCostGate),
    };
  }

  const admittedRows = rows.filter(
    (row) =>
      isRecord(row.discoveryAdmission) &&
      row.discoveryAdmission.admitted === true &&
      isRecord(row.skuAdmission) &&
      row.skuAdmission.admitted === true,
  );

  const shippingRichRows = admittedRows.filter(
    (row) => isRecord(row.shippingGate) && row.shippingGate.admitted === true,
  );

  const bestAdmittedCandidate = shippingRichRows[0] ?? admittedRows[0] ?? null;
  const bestFailedAdmittedCandidate =
    admittedRows.find((row) => isRecord(row.shippingGate) && row.shippingGate.admitted === false) ?? null;

  const summary = {
    generatedAt: new Date().toISOString(),
    userId,
    seedStrategyUsed: {
      seedQueries,
      inventoryPath:
        'affiliate_search_ship_to_cl -> discovery_gate -> cl_sku_gate -> shipping_gate -> strict_ml_chile_funnel',
    },
    scannedByQuery,
    scannedAtDiscovery: rows.length,
    admittedAfterChileSupportGate: rows.filter(
      (row) => isRecord(row.discoveryAdmission) && row.discoveryAdmission.admitted === true,
    ).length,
    admittedAfterClSkuGate: rows.filter(
      (row) => isRecord(row.skuAdmission) && row.skuAdmission.admitted === true,
    ).length,
    admittedAfterShippingCostGate: shippingRichRows.length,
    rejectedBeforeEnrichment: rows.filter(
      (row) => !(isRecord(row.shippingGate) && row.shippingGate.admitted === true),
    ).length,
    nearValid: 0,
    validated: 0,
    discoveryGateSummaryByCode,
    clSkuGateSummaryByCode,
    shippingGateSummaryByCode,
    patternInventory,
    bestAdmittedCandidate,
    bestFailedAdmittedCandidate,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.log(
    JSON.stringify(
      {
        script: 'run-ml-chile-shipping-rich-pass',
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(0);
});
