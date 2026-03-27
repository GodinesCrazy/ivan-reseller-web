import type { ShippingMethod } from '../services/aliexpress-dropshipping-api.service';

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const values = Object.values(record);
    if (values.length === 1 && Array.isArray(values[0])) return values[0] as unknown[];
  }
  return [];
}

function getFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function normalizeMethod(raw: unknown): ShippingMethod | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const methodId = getFirstString(
    record.methodId,
    record.method_id,
    record.logistics_id,
    record.logisticsId,
    record.service_name,
    record.display_name,
  );
  const methodName = getFirstString(
    record.methodName,
    record.method_name,
    record.service_name,
    record.display_name,
    record.logistics_service_name,
    record.company,
  );

  const cost =
    toNumber(record.cost) ??
    toNumber(record.shipping_fee) ??
    toNumber(record.fee) ??
    toNumber(record.freight) ??
    toNumber((record.shipping_fee_cent as number | undefined) != null ? Number(record.shipping_fee_cent) / 100 : null) ??
    toNumber((record.fee_cent as number | undefined) != null ? Number(record.fee_cent) / 100 : null) ??
    0;

  const estimatedDays =
    toNumber(record.estimatedDays) ??
    toNumber(record.estimated_days) ??
    toNumber(record.delivery_day_max) ??
    toNumber(record.max_delivery_days) ??
    toNumber(record.time) ??
    0;

  if (!methodId && !methodName) return null;

  return {
    methodId: methodId || methodName || 'unknown',
    methodName: methodName || methodId || 'Shipping',
    cost: Number.isFinite(cost) ? cost : 0,
    estimatedDays: Number.isFinite(estimatedDays) ? estimatedDays : 0,
  };
}

function collectCandidateMethodArrays(logisticsInfo: Record<string, unknown>): unknown[][] {
  const arrays: unknown[][] = [];
  const directCandidates = [
    logisticsInfo.availableShippingMethods,
    logisticsInfo.available_shipping_methods,
    logisticsInfo.logistics_detail_list,
    logisticsInfo.logistics_detail_dtos,
    logisticsInfo.logistics_service_result_list,
    logisticsInfo.freight_ext,
    logisticsInfo.delivery_options,
  ];

  for (const candidate of directCandidates) {
    const arr = asArray(candidate);
    if (arr.length > 0) arrays.push(arr);
  }

  for (const value of Object.values(logisticsInfo)) {
    if (!value || typeof value !== 'object') continue;
    const nested = value as Record<string, unknown>;
    const nestedCandidates = [
      nested.logistics_detail_list,
      nested.logistics_detail_d_t_o,
      nested.logistics_detail_dto,
      nested.logistics_service_result_list,
      nested.delivery_options,
      nested.service_list,
      nested.method,
      nested.methods,
    ];
    for (const candidate of nestedCandidates) {
      const arr = asArray(candidate);
      if (arr.length > 0) arrays.push(arr);
    }
  }

  return arrays;
}

export function normalizeAliExpressShippingMethods(source: unknown): ShippingMethod[] {
  if (!source || typeof source !== 'object') return [];
  const record = source as Record<string, unknown>;

  const classicMethods = asArray((record.shipping_info as Record<string, unknown> | undefined)?.methods)
    .map(normalizeMethod)
    .filter((value): value is ShippingMethod => !!value);
  if (classicMethods.length > 0) return classicMethods;

  const logisticsInfo = record.logistics_info_dto as Record<string, unknown> | undefined;
  if (!logisticsInfo || typeof logisticsInfo !== 'object') return [];

  const methods: ShippingMethod[] = [];
  for (const candidateArray of collectCandidateMethodArrays(logisticsInfo)) {
    for (const item of candidateArray) {
      const normalized = normalizeMethod(item);
      if (normalized) methods.push(normalized);
    }
  }

  const unique = new Map<string, ShippingMethod>();
  for (const method of methods) {
    const key = `${method.methodId}:${method.methodName}:${method.cost}:${method.estimatedDays}`;
    if (!unique.has(key)) unique.set(key, method);
  }

  return Array.from(unique.values());
}

export function summarizeAliExpressLogisticsForensics(source: unknown): {
  hasClassicShippingInfo: boolean;
  hasLogisticsInfoDto: boolean;
  normalizedMethodCount: number;
  logisticsInfoKeys: string[];
} {
  if (!source || typeof source !== 'object') {
    return {
      hasClassicShippingInfo: false,
      hasLogisticsInfoDto: false,
      normalizedMethodCount: 0,
      logisticsInfoKeys: [],
    };
  }

  const record = source as Record<string, unknown>;
  const logisticsInfo = record.logistics_info_dto as Record<string, unknown> | undefined;

  return {
    hasClassicShippingInfo: !!record.shipping_info,
    hasLogisticsInfoDto: !!logisticsInfo,
    normalizedMethodCount: normalizeAliExpressShippingMethods(source).length,
    logisticsInfoKeys: logisticsInfo ? Object.keys(logisticsInfo) : [],
  };
}

export type AliExpressChileSupportSignal =
  | 'confirmed_with_shipping_methods'
  | 'acknowledged_without_shipping_methods'
  | 'no_support_signal'
  | 'supplier_data_incomplete';

export function evaluateAliExpressChileSupportSignal(source: unknown): {
  signal: AliExpressChileSupportSignal;
  shipToCountry?: string;
  deliveryTime?: number | null;
  normalizedMethodCount: number;
  reason: string;
} {
  if (!source || typeof source !== 'object') {
    return {
      signal: 'supplier_data_incomplete',
      normalizedMethodCount: 0,
      reason: 'Supplier response is missing or not an object.',
    };
  }

  const record = source as Record<string, unknown>;
  const logisticsInfo =
    (record.logistics_info_dto as Record<string, unknown> | undefined) ||
    (record.logisticsInfoDto as Record<string, unknown> | undefined) ||
    {};
  const shipToCountry =
    getFirstString(logisticsInfo.ship_to_country, logisticsInfo.shipToCountry)?.toUpperCase() || undefined;
  const deliveryTime = toNumber(logisticsInfo.delivery_time ?? logisticsInfo.deliveryTime);
  const normalizedMethodCount = normalizeAliExpressShippingMethods(source).length;

  if (normalizedMethodCount > 0) {
    return {
      signal: 'confirmed_with_shipping_methods',
      shipToCountry,
      deliveryTime,
      normalizedMethodCount,
      reason: 'Supplier exposed normalized shipping methods for CL.',
    };
  }

  if (shipToCountry === 'CL' && deliveryTime != null && deliveryTime > 0) {
    return {
      signal: 'acknowledged_without_shipping_methods',
      shipToCountry,
      deliveryTime,
      normalizedMethodCount,
      reason: 'Supplier acknowledged CL in logistics_info_dto and exposed delivery_time, but not method/cost details.',
    };
  }

  if (shipToCountry === 'CL') {
    return {
      signal: 'acknowledged_without_shipping_methods',
      shipToCountry,
      deliveryTime,
      normalizedMethodCount,
      reason: 'Supplier acknowledged CL in logistics_info_dto, but exposed no shipping method details.',
    };
  }

  return {
    signal: 'no_support_signal',
    shipToCountry,
    deliveryTime,
    normalizedMethodCount,
    reason: 'Supplier exposed no reliable CL destination support signal.',
  };
}
