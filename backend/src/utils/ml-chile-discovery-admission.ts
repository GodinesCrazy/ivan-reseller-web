import type { DropshippingProductInfo } from '../services/aliexpress-dropshipping-api.service';
import { normalizeAliExpressRawSkus } from './aliexpress-raw-sku-normalizer';
import { evaluateAliExpressChileSupportSignal } from './aliexpress-logistics-normalizer';

export type MlChileDiscoveryAdmissionCode =
  | 'admitted'
  | 'no_destination_support_cl'
  | 'supplier_data_incomplete';

export interface MlChileDiscoveryAdmissionResult {
  code: MlChileDiscoveryAdmissionCode;
  admitted: boolean;
  shippingMethodCount: number;
  usableSkuCount: number;
  supportSignal:
    | 'confirmed_with_shipping_methods'
    | 'acknowledged_without_shipping_methods'
    | 'no_support_signal'
    | 'supplier_data_incomplete';
  reason: string;
}

export function evaluateMlChileDiscoveryAdmission(
  info: DropshippingProductInfo,
): MlChileDiscoveryAdmissionResult {
  const usableSkus =
    info.skus && info.skus.length > 0
      ? info.skus
      : normalizeAliExpressRawSkus(info as unknown as Record<string, unknown>);
  const support = evaluateAliExpressChileSupportSignal(info as unknown as Record<string, unknown>);

  if (support.signal === 'supplier_data_incomplete' && usableSkus.length === 0) {
    return {
      code: 'supplier_data_incomplete',
      admitted: false,
      shippingMethodCount: support.normalizedMethodCount,
      usableSkuCount: usableSkus.length,
      supportSignal: support.signal,
      reason: 'Supplier response is too incomplete to classify Chile support safely.',
    };
  }

  if (support.signal === 'no_support_signal') {
    return {
      code: 'no_destination_support_cl',
      admitted: false,
      shippingMethodCount: support.normalizedMethodCount,
      usableSkuCount: usableSkus.length,
      supportSignal: support.signal,
      reason: 'Supplier exposed no reliable CL destination support signal.',
    };
  }

  return {
    code: 'admitted',
    admitted: true,
    shippingMethodCount: support.normalizedMethodCount,
    usableSkuCount: usableSkus.length,
    supportSignal: support.signal,
    reason: support.reason,
  };
}
