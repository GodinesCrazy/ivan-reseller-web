import { buildCjEbayBridgeSupplierMetadata } from '../../services/marketplace-order-sync-cj-metadata';

describe('buildCjEbayBridgeSupplierMetadata', () => {
  it('includes mapping confidence and CJ ids', () => {
    const meta = buildCjEbayBridgeSupplierMetadata({
      id: 42,
      ebaySku: 'CJE1P2V3',
      evaluationId: 9,
      shippingQuoteId: 8,
      product: { cjProductId: 'PID123', title: 'T' },
      variant: { cjVid: 'VID1', cjSku: 'SKU1' },
    });
    expect(meta.mappingSource).toBe('ebay_line_sku_cj_ebay_listing');
    expect(meta.mappingConfidence).toBe('high');
    expect(meta.cjProductId).toBe('PID123');
    expect(meta.cjVid).toBe('VID1');
    expect(meta.cjSku).toBe('SKU1');
    expect(meta.ebaySku).toBe('CJE1P2V3');
    expect(meta.cjEbayListingId).toBe(42);
  });
});
