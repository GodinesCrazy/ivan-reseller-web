type UnknownRecord = Record<string, unknown>;

export type MlChileSellerLogisticsClassification =
  | 'Chile-shipping-rich'
  | 'Chile-shipping-poor'
  | 'ambiguous'
  | 'data-incomplete';

export interface MlChileSellerLogisticsPattern {
  classification: MlChileSellerLogisticsClassification;
  sellerCompletenessScore: number;
  sellerKey: string;
  shipFromHints: string[];
  logisticsKeys: string[];
  packageKeys: string[];
  normalizedShippingMethodCount: number;
}

interface BuildMlChileSellerLogisticsPatternInput {
  rawProduct?: unknown;
  rawLogisticsInfoDto?: unknown;
  shippingMethods?: unknown;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function collectHintsByKey(value: unknown, keyMatchers: string[]): string[] {
  const hints = new Set<string>();
  const records = flattenRecords(value);

  for (const record of records) {
    for (const [key, raw] of Object.entries(record)) {
      const normalizedKey = key.toLowerCase();
      if (!keyMatchers.some((matcher) => normalizedKey.includes(matcher))) {
        continue;
      }

      if (typeof raw === 'string' && raw.trim()) {
        hints.add(`${key}:${raw.trim()}`);
      } else if (typeof raw === 'number' || typeof raw === 'boolean') {
        hints.add(`${key}:${String(raw)}`);
      } else if (isRecord(raw)) {
        hints.add(key);
      }
    }
  }

  return [...hints].slice(0, 10);
}

function extractKeys(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.keys(value).sort();
}

function extractSellerRecord(rawProduct: unknown): UnknownRecord | null {
  if (!isRecord(rawProduct)) {
    return null;
  }

  if (isRecord(rawProduct.ae_store_info)) {
    return rawProduct.ae_store_info;
  }

  const records = flattenRecords(rawProduct);
  return records.find((record) => 'store_id' in record || 'store_name' in record || 'seller_admin_seq' in record) ?? null;
}

function buildSellerKey(sellerRecord: UnknownRecord | null): { sellerKey: string; completeness: number } {
  if (!sellerRecord) {
    return { sellerKey: 'seller:unknown', completeness: 0 };
  }

  const storeId =
    sellerRecord.store_id ??
    sellerRecord.storeId ??
    sellerRecord.store_num ??
    sellerRecord.storeNum ??
    sellerRecord.seller_admin_seq ??
    sellerRecord.owner_member_seq ??
    'unknown';
  const storeName =
    sellerRecord.store_name ??
    sellerRecord.storeName ??
    sellerRecord.store_title ??
    sellerRecord.storeTitle ??
    'unknown';

  const completeness = ['store_id', 'store_name', 'seller_admin_seq', 'owner_member_seq', 'store_url']
    .filter((key) => key in sellerRecord)
    .length;

  return {
    sellerKey: `seller:${String(storeId)}|store:${String(storeName)}`,
    completeness,
  };
}

export function buildMlChileSellerLogisticsPattern(
  input: BuildMlChileSellerLogisticsPatternInput,
): MlChileSellerLogisticsPattern {
  const rawProduct = isRecord(input.rawProduct) ? input.rawProduct : null;
  const rawLogisticsInfoDto = isRecord(input.rawLogisticsInfoDto) ? input.rawLogisticsInfoDto : null;
  const shippingMethods = Array.isArray(input.shippingMethods) ? input.shippingMethods : [];

  const logisticsKeys = extractKeys(rawLogisticsInfoDto);
  const packageKeys = rawProduct && isRecord(rawProduct.package_info_dto)
    ? extractKeys(rawProduct.package_info_dto)
    : [];
  const shipFromHints = collectHintsByKey(rawProduct, [
    'ship_from',
    'warehouse',
    'send_goods',
    'delivery_place',
    'origin',
  ]);

  const seller = buildSellerKey(extractSellerRecord(rawProduct));

  let classification: MlChileSellerLogisticsClassification = 'data-incomplete';

  if (shippingMethods.length > 0) {
    classification = 'Chile-shipping-rich';
  } else if (logisticsKeys.includes('ship_to_country') && logisticsKeys.includes('delivery_time')) {
    classification = logisticsKeys.length <= 2 ? 'Chile-shipping-poor' : 'ambiguous';
  } else if (logisticsKeys.length > 0 || shipFromHints.length > 0 || packageKeys.length > 0) {
    classification = 'ambiguous';
  }

  return {
    classification,
    sellerCompletenessScore: seller.completeness,
    sellerKey: seller.sellerKey,
    shipFromHints,
    logisticsKeys,
    packageKeys,
    normalizedShippingMethodCount: shippingMethods.length,
  };
}
