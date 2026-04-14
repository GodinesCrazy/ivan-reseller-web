import { resolveCjVariantKeyForPipeline } from '../services/cj-ebay-variant-resolution';
import type { CjProductDetail } from '../adapters/cj-supplier.adapter.interface';

function detailWithVariants(
  variants: Array<{ cjSku: string; cjVid?: string | null }>
): CjProductDetail {
  return {
    cjProductId: 'P1',
    title: 'T',
    description: '',
    imageUrls: [],
    variants: variants.map((v) => ({
      cjSku: v.cjSku,
      cjVid: v.cjVid ?? undefined,
      unitCostUsd: 1,
      stock: 10,
      attributes: {} as Record<string, string>,
    })),
  };
}

describe('resolveCjVariantKeyForPipeline', () => {
  it('uses explicit variant id when valid', () => {
    const d = detailWithVariants([
      { cjSku: 'S1', cjVid: 'V1' },
      { cjSku: 'S2', cjVid: 'V2' },
    ]);
    const r = resolveCjVariantKeyForPipeline(d, 'V2');
    expect(r.variantKey).toBe('V2');
    expect(r.resolution).toBe('client');
  });

  it('auto-picks single variant vid', () => {
    const d = detailWithVariants([{ cjSku: 'SKU99', cjVid: 'VID42' }]);
    const r = resolveCjVariantKeyForPipeline(d, undefined);
    expect(r.variantKey).toBe('VID42');
    expect(r.resolution).toBe('single_variant');
  });

  it('auto-picks sku when vid missing', () => {
    const d = detailWithVariants([{ cjSku: 'ONLY_SKU', cjVid: null }]);
    const r = resolveCjVariantKeyForPipeline(d, undefined);
    expect(r.variantKey).toBe('ONLY_SKU');
    expect(r.resolution).toBe('single_variant');
  });

  it('throws on multi-variant without explicit id', () => {
    const d = detailWithVariants([
      { cjSku: 'A', cjVid: '1' },
      { cjSku: 'B', cjVid: '2' },
    ]);
    expect(() => resolveCjVariantKeyForPipeline(d, undefined)).toThrow(/Multiple CJ variants/);
  });
});
