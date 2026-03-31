import { getProductValidationSnapshot } from '../catalog-validation-state.service';

describe('catalog-validation-state.service — opportunity import', () => {
  it('uses preventiveAuditPending instead of policyIncomplete for PENDING opportunity imports', () => {
    const snap = getProductValidationSnapshot({
      status: 'PENDING',
      currency: 'USD',
      targetCountry: 'CL',
      shippingCost: 2,
      totalCost: 12,
      aliexpressSku: 'sku-1',
      productData: JSON.stringify({
        importSource: 'opportunity_search',
        preventivePublish: {
          marketplace: 'mercadolibre',
          selectedSupplier: { productId: '123', skuId: 'sku-1' },
          policyComplianceReady: false,
        },
        opportunityImport: { importSource: 'opportunity_search' },
      }),
    });
    expect(snap.blockedReasons).toContain('preventiveAuditPending');
    expect(snap.blockedReasons).not.toContain('policyIncomplete');
  });

  it('does not flag incompleteFees when totalCost is null but cost is inferrable from price + shipping + tax', () => {
    const snap = getProductValidationSnapshot({
      status: 'PENDING',
      currency: 'USD',
      targetCountry: 'CL',
      shippingCost: 2,
      importTax: 1,
      aliexpressPrice: 9,
      totalCost: null,
      aliexpressSku: 'sku-1',
      productData: JSON.stringify({
        importSource: 'opportunity_search',
        preventivePublish: {
          marketplace: 'mercadolibre',
          resolvedLanguage: 'es',
          selectedSupplier: { productId: '123', skuId: 'sku-1' },
          policyComplianceReady: false,
        },
        opportunityImport: { importSource: 'opportunity_search' },
      }),
    });
    expect(snap.blockedReasons).not.toContain('incompleteFees');
  });
});
