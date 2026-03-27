import type { DropshippingProductInfo } from '../services/aliexpress-dropshipping-api.service';
import { normalizeAliExpressRawSkus } from './aliexpress-raw-sku-normalizer';
import { evaluateAliExpressChileSupportSignal } from './aliexpress-logistics-normalizer';

export type MlChileSkuAdmissionCode =
  | 'admitted'
  | 'no_cl_sku'
  | 'cl_sku_no_stock'
  | 'no_destination_support_cl'
  | 'no_purchasable_variant'
  | 'supplier_data_incomplete';

export interface MlChileSkuAdmissionResult {
  code: MlChileSkuAdmissionCode;
  admitted: boolean;
  skuId?: string;
  stock?: number;
  salePrice?: number;
  reason: string;
}

export function evaluateMlChileSkuAdmission(info: DropshippingProductInfo): MlChileSkuAdmissionResult {
  const skus =
    info.skus && info.skus.length > 0
      ? info.skus
      : normalizeAliExpressRawSkus(info as unknown as Record<string, unknown>);
  const support = evaluateAliExpressChileSupportSignal(info as unknown as Record<string, unknown>);
  const hasShippingSupport = support.signal !== 'no_support_signal' && support.signal !== 'supplier_data_incomplete';
  const allSkusMissing = skus.length === 0;

  if (support.signal === 'supplier_data_incomplete' && allSkusMissing) {
    return {
      code: 'supplier_data_incomplete',
      admitted: false,
      reason: 'Supplier response has neither normalized Chile shipping methods nor usable SKU rows.',
    };
  }

  if (!hasShippingSupport) {
    return {
      code: 'no_destination_support_cl',
      admitted: false,
      reason: 'Supplier exposed no reliable shipping support signal for destination CL.',
    };
  }

  if (allSkusMissing) {
    return {
      code: 'no_cl_sku',
      admitted: false,
      reason: 'Supplier response exposed no usable AliExpress SKU rows for destination CL.',
    };
  }

  const inStock = skus.filter((sku) => Number(sku.stock || 0) > 0);
  if (inStock.length === 0) {
    return {
      code: 'cl_sku_no_stock',
      admitted: false,
      reason: 'Supplier exposed CL SKU rows but all have stock <= 0.',
    };
  }

  const purchasable = inStock
    .filter((sku) => Number.isFinite(Number(sku.salePrice)) && Number(sku.salePrice) > 0)
    .sort((a, b) => Number(a.salePrice) - Number(b.salePrice))[0];

  if (!purchasable) {
    return {
      code: 'no_purchasable_variant',
      admitted: false,
      reason: 'Supplier exposed CL stock but no purchasable variant with valid price.',
    };
  }

  return {
    code: 'admitted',
    admitted: true,
    skuId: String(purchasable.skuId),
    stock: Number(purchasable.stock),
    salePrice: Number(purchasable.salePrice),
    reason: 'At least one CL-valid purchasable SKU exists with stock > 0.',
  };
}
