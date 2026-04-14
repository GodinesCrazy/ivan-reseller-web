/**
 * Resolves CJ variant key (vid preferred, else SKU) for eBay pipeline when UI omits variantId.
 */

import { AppError } from '../../../middleware/error.middleware';
import type { CjProductDetail } from '../adapters/cj-supplier.adapter.interface';

function pickVariant(detail: CjProductDetail, variantId: string): boolean {
  const v = String(variantId || '').trim();
  return (
    detail.variants.some((x) => String(x.cjVid || '').trim() === v) ||
    detail.variants.some((x) => x.cjSku === v)
  );
}

export type CjVariantResolutionMode = 'client' | 'single_variant';

/**
 * @param explicitVariantId — CJ vid or SKU from UI / opportunity row
 * @returns variant key to pass to evaluate/draft (same string CJ APIs accept)
 */
export function resolveCjVariantKeyForPipeline(
  detail: CjProductDetail,
  explicitVariantId?: string | null
): { variantKey: string; resolution: CjVariantResolutionMode } {
  const exp = String(explicitVariantId || '').trim();
  if (exp) {
    if (!pickVariant(detail, exp)) {
      throw new AppError(`Variant not found for vid/sku: ${exp}`, 400);
    }
    return { variantKey: exp, resolution: 'client' };
  }

  const variants = detail.variants || [];
  if (variants.length === 0) {
    throw new AppError('CJ product has no variants.', 400);
  }
  if (variants.length > 1) {
    throw new AppError(
      'Multiple CJ variants — select variantId (CJ vid or SKU) before eBay draft.',
      400
    );
  }

  const only = variants[0]!;
  const key = (only.cjVid && String(only.cjVid).trim()) || String(only.cjSku || '').trim();
  if (!key) {
    throw new AppError('CJ variant missing vid/sku.', 400);
  }
  return { variantKey: key, resolution: 'single_variant' };
}
