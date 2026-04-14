export interface AliExpressFreightOption {
  serviceName: string;
  freightAmount: number;
  freightCurrency: string;
  estimatedDeliveryTime?: number;
  isTrackedLike: boolean;
  isFreeShipping: boolean;
  raw: Record<string, unknown>;
}

export interface AliExpressFreightQuoteResult {
  options: AliExpressFreightOption[];
  rawTopKeys: string[];
  rawOptionNodeCount: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];
  const nestedArrays = Object.values(record).filter(Array.isArray);
  if (nestedArrays.length > 0) return nestedArrays.flat();
  return Object.values(record);
}

function readString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readNumberLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[^\d.-]/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  for (const key of ['amount', 'value', 'cent', 'price', 'freight_amount']) {
    const nested = readNumberLike(record[key]);
    if (nested != null) return key === 'cent' ? nested / 100 : nested;
  }
  return null;
}

function readBoolean(source: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
    }
    if (typeof value === 'number') return value !== 0;
  }
  return null;
}

function collectCandidateNodes(value: unknown, sink: Record<string, unknown>[], depth = 0): void {
  if (depth > 8) return;
  const record = asRecord(value);
  if (record) {
    const serviceName = readString(record, [
      'service_name',
      'serviceName',
      'logistics_service_name',
      'logisticsServiceName',
      'delivery_name',
      'deliveryName',
      'company_name',
      'companyName',
      'shipping_method_name',
      'shippingMethodName',
    ]);
    const amount = readNumberLike(
      record.freight_amount ??
        record.freightAmount ??
        record.shipping_fee ??
        record.shippingFee ??
        record.price ??
        record.cost ??
        record.display_amount ??
        record.displayAmount,
    );
    const freeShipping = readBoolean(record, [
      'free_shipping',
      'freeShipping',
      'is_free_shipping',
      'isFreeShipping',
    ]);
    if (serviceName || amount != null || freeShipping != null) {
      sink.push(record);
    }
    for (const nested of Object.values(record)) {
      collectCandidateNodes(nested, sink, depth + 1);
    }
    return;
  }

  for (const item of asArray(value)) {
    collectCandidateNodes(item, sink, depth + 1);
  }
}

function normalizeFreightOption(node: Record<string, unknown>): AliExpressFreightOption | null {
  const freightRecord = asRecord(node.freight);
  const serviceName =
    readString(node, [
      'service_name',
      'serviceName',
      'logistics_service_name',
      'logisticsServiceName',
      'delivery_name',
      'deliveryName',
      'company_name',
      'companyName',
      'shipping_method_name',
      'shippingMethodName',
    ]) || 'Unknown service';

  const freightAmount =
    readNumberLike(
      node.freight_amount ??
        node.freightAmount ??
        node.shipping_fee ??
        node.shippingFee ??
        node.price ??
        node.cost ??
        node.display_amount ??
        node.displayAmount ??
        freightRecord,
    ) ?? 0;

  const freightCurrency =
    readString(node, [
      'currency',
      'freight_currency',
      'freightCurrency',
      'display_currency',
      'displayCurrency',
      'price_currency',
      'priceCurrency',
    ]) ||
    readString(freightRecord || {}, ['currency_code', 'currencyCode']) ||
    'USD';

  const estimatedDeliveryRaw =
    node.delivery_time ??
    node.deliveryTime ??
    node.estimated_delivery_days ??
    node.estimatedDeliveryDays ??
    node.estimated_delivery_time ??
    node.estimatedDeliveryTime;
  const estimatedDeliveryTime =
    typeof estimatedDeliveryRaw === 'string'
      ? (() => {
          const match = estimatedDeliveryRaw.match(/\d+/);
          return match ? Number(match[0]) : undefined;
        })()
      : readNumberLike(estimatedDeliveryRaw) ?? undefined;

  const freeShipping =
    readBoolean(node, [
      'free_shipping',
      'freeShipping',
      'is_free_shipping',
      'isFreeShipping',
    ]) ?? freightAmount === 0;

  if (!serviceName && freightAmount == null && !freeShipping) {
    return null;
  }

  return {
    serviceName,
    freightAmount,
    freightCurrency: freightCurrency.toUpperCase(),
    estimatedDeliveryTime: estimatedDeliveryTime == null ? undefined : Number(estimatedDeliveryTime),
    isTrackedLike: /(standard|std|tracked|tracking|registered|premium|select|cainiao.*(standard|std|fulfillment))/i.test(
      serviceName,
    ),
    isFreeShipping: Boolean(freeShipping),
    raw: node,
  };
}

export function normalizeAliExpressFreightQuoteResult(
  raw: Record<string, unknown> | null | undefined,
): AliExpressFreightQuoteResult {
  const candidateNodes: Record<string, unknown>[] = [];
  collectCandidateNodes(raw || {}, candidateNodes);

  const dedup = new Map<string, AliExpressFreightOption>();
  for (const node of candidateNodes) {
    const option = normalizeFreightOption(node);
    if (!option) continue;
    const key = [
      option.serviceName.toLowerCase(),
      option.freightAmount.toFixed(2),
      option.freightCurrency.toUpperCase(),
      option.estimatedDeliveryTime ?? '',
    ].join('|');
    if (!dedup.has(key)) dedup.set(key, option);
  }

  return {
    options: Array.from(dedup.values()).sort((a, b) => a.freightAmount - b.freightAmount),
    rawTopKeys: raw ? Object.keys(raw).slice(0, 25) : [],
    rawOptionNodeCount: candidateNodes.length,
  };
}
