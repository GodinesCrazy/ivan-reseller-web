import {
  appendEbayUsDropshipShippingNotice,
  buildEbayUsDropshipDeliveryRange,
  extractSupplierDeliveryDaysHint,
} from './ebay-us-delivery-estimate';

const defaultOpts = {
  fallbackMin: 12,
  fallbackMax: 35,
  processingMin: 2,
  processingMax: 5,
  automatedDropshipPadMin: 0,
  automatedDropshipPadMax: 0,
};

describe('ebay-us-delivery-estimate', () => {
  it('extracts hint from productData JSON estimatedDeliveryDays', () => {
    const hint = extractSupplierDeliveryDaysHint({
      productData: JSON.stringify({ estimatedDeliveryDays: 18 }),
    });
    expect(hint).toBe(18);
  });

  it('extracts hint from nested sourceData.shipping_info.estimated_days', () => {
    const hint = extractSupplierDeliveryDaysHint({
      productData: JSON.stringify({
        sourceData: { shipping_info: { estimated_days: 22 } },
      }),
    });
    expect(hint).toBe(22);
  });

  it('buildEbayUsDropshipDeliveryRange uses fallback when no hint', () => {
    const r = buildEbayUsDropshipDeliveryRange({ productData: '{}' }, defaultOpts);
    expect(r.source).toBe('fallback');
    expect(r.minDays).toBe(12);
    expect(r.maxDays).toBe(35);
  });

  it('buildEbayUsDropshipDeliveryRange widens supplier hint with processing buffer', () => {
    const r = buildEbayUsDropshipDeliveryRange(
      { productData: JSON.stringify({ estimatedDeliveryDays: 20 }) },
      defaultOpts,
    );
    expect(r.source).toBe('supplier_hint');
    expect(r.minDays).toBeGreaterThanOrEqual(5 + 2);
    expect(r.maxDays).toBeGreaterThanOrEqual(r.minDays);
  });

  it('appendEbayUsDropshipShippingNotice skips when estimated delivery already present', () => {
    const d = 'Great item. Estimated delivery varies by location.';
    expect(appendEbayUsDropshipShippingNotice(d, { minDays: 10, maxDays: 20 })).toBe(d);
  });

  it('appendEbayUsDropshipShippingNotice appends block when absent', () => {
    const out = appendEbayUsDropshipShippingNotice('Blue widget.', { minDays: 10, maxDays: 25 });
    expect(out).toContain('10 to 25 business days');
    expect(out.startsWith('Blue widget.')).toBe(true);
  });
});
