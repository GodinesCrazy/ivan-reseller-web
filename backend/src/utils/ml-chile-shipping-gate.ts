type UnknownRecord = Record<string, unknown>;

export type MlChileShippingGateCode =
  | 'admitted'
  | 'missing_shipping_cost_true_supplier_side'
  | 'missing_shipping_cost_gate_false_negative'
  | 'shipping_method_present_but_cost_unparsed'
  | 'free_shipping_acknowledged_but_not_normalized'
  | 'supplier_data_incomplete';

export interface MlChileShippingGateResult {
  code: MlChileShippingGateCode;
  admitted: boolean;
  shippingMethodCount: number;
  reason: string;
}

interface EvaluateMlChileShippingGateInput {
  shippingMethods?: unknown;
  rawLogisticsInfoDto?: unknown;
  rawProduct?: unknown;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
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

function extractNormalizedShippingMethods(shippingMethods: unknown): UnknownRecord[] {
  if (!Array.isArray(shippingMethods)) {
    return [];
  }

  return shippingMethods.filter(isRecord);
}

function methodHasParsedCost(method: UnknownRecord): boolean {
  const candidates = [
    method.shippingCost,
    method.cost,
    method.price,
    method.amount,
    method.freight,
    method.fee,
    isRecord(method.price) ? method.price.amount : null,
    isRecord(method.shippingCost) ? method.shippingCost.amount : null,
  ];

  return candidates.some((candidate) => toFiniteNumber(candidate) !== null);
}

function methodIsFreeShipping(method: UnknownRecord): boolean {
  const explicitFlags = [
    method.freeShipping,
    method.isFreeShipping,
    method.free_shipping,
  ];

  if (explicitFlags.some((value) => value === true || value === 'true')) {
    return true;
  }

  const zeroCandidates = [
    method.shippingCost,
    method.cost,
    method.price,
    method.amount,
    method.freight,
    method.fee,
    isRecord(method.price) ? method.price.amount : null,
    isRecord(method.shippingCost) ? method.shippingCost.amount : null,
  ];

  return zeroCandidates.some((candidate) => toFiniteNumber(candidate) === 0);
}

function collectShippingSignals(rawLogisticsInfoDto: unknown, rawProduct: unknown): {
  hasMethodLikeSignal: boolean;
  hasCostLikeSignal: boolean;
  hasFreeShippingSignal: boolean;
} {
  const records = [
    ...flattenRecords(rawLogisticsInfoDto),
    ...flattenRecords(rawProduct),
  ];

  let hasMethodLikeSignal = false;
  let hasCostLikeSignal = false;
  let hasFreeShippingSignal = false;

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      const normalizedKey = key.toLowerCase();

      if (
        normalizedKey.includes('method') ||
        normalizedKey.includes('service') ||
        normalizedKey.includes('company') ||
        normalizedKey.includes('route')
      ) {
        hasMethodLikeSignal = true;
      }

      if (
        normalizedKey.includes('cost') ||
        normalizedKey.includes('price') ||
        normalizedKey.includes('fee') ||
        normalizedKey.includes('freight') ||
        normalizedKey.includes('amount')
      ) {
        hasCostLikeSignal = true;
      }

      if (
        normalizedKey.includes('free') &&
        (value === true || value === 'true' || toFiniteNumber(value) === 0)
      ) {
        hasFreeShippingSignal = true;
      }
    }
  }

  return {
    hasMethodLikeSignal,
    hasCostLikeSignal,
    hasFreeShippingSignal,
  };
}

export function evaluateMlChileShippingGate(
  input: EvaluateMlChileShippingGateInput,
): MlChileShippingGateResult {
  const normalizedMethods = extractNormalizedShippingMethods(input.shippingMethods);

  if (normalizedMethods.some((method) => methodHasParsedCost(method))) {
    return {
      code: 'admitted',
      admitted: true,
      shippingMethodCount: normalizedMethods.length,
      reason: 'At least one normalized shipping method exposes a real shipping cost or zero-cost free-shipping value.',
    };
  }

  if (normalizedMethods.some((method) => methodIsFreeShipping(method))) {
    return {
      code: 'admitted',
      admitted: true,
      shippingMethodCount: normalizedMethods.length,
      reason: 'At least one normalized shipping method exposes a truthful free-shipping signal.',
    };
  }

  const signals = collectShippingSignals(input.rawLogisticsInfoDto, input.rawProduct);

  if (normalizedMethods.length > 0 && (signals.hasMethodLikeSignal || signals.hasCostLikeSignal)) {
    return {
      code: 'shipping_method_present_but_cost_unparsed',
      admitted: false,
      shippingMethodCount: normalizedMethods.length,
      reason: 'Shipping method structure exists, but cost truth is still not parsed into a real numeric or free-shipping value.',
    };
  }

  if (signals.hasFreeShippingSignal) {
    return {
      code: 'free_shipping_acknowledged_but_not_normalized',
      admitted: false,
      shippingMethodCount: normalizedMethods.length,
      reason: 'Supplier payload hints at free shipping, but the current normalized path does not expose it as usable shipping truth.',
    };
  }

  if (signals.hasMethodLikeSignal || signals.hasCostLikeSignal) {
    return {
      code: 'missing_shipping_cost_gate_false_negative',
      admitted: false,
      shippingMethodCount: normalizedMethods.length,
      reason: 'Raw payload exposes shipping-related signals that are not reaching the normalized shipping-cost path.',
    };
  }

  if (isRecord(input.rawLogisticsInfoDto) || isRecord(input.rawProduct)) {
    return {
      code: 'missing_shipping_cost_true_supplier_side',
      admitted: false,
      shippingMethodCount: normalizedMethods.length,
      reason: 'Supplier payload acknowledges the destination, but no shipping method or shipping-cost truth is present.',
    };
  }

  return {
    code: 'supplier_data_incomplete',
    admitted: false,
    shippingMethodCount: normalizedMethods.length,
    reason: 'Supplier payload is too incomplete to classify shipping cost truth safely.',
  };
}
