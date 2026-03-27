import {
  classifySupplierValidationReason,
  summarizeSupplierValidationReasons,
} from '../../services/supplier-validation-reason.service';

describe('supplier-validation-reason.service', () => {
  it('classifies stock and shipping blockers precisely', () => {
    expect(
      classifySupplierValidationReason('Product not valid for publishing: no AliExpress SKU with stock > 0 for this destination')
    ).toBe('no_stock_for_destination');

    expect(
      classifySupplierValidationReason('no real AliExpress API shipping cost for destination')
    ).toBe('no_shipping_for_destination');
  });

  it('classifies financial and language blockers precisely', () => {
    expect(
      classifySupplierValidationReason('financial completeness is insufficient: missing marketplace fee estimate')
    ).toBe('fee_incomplete');

    expect(
      classifySupplierValidationReason('marketplace language could not be resolved or is not supported safely')
    ).toBe('unsupported_language');
  });

  it('summarizes reason codes without reclassifying known codes incorrectly', () => {
    expect(
      summarizeSupplierValidationReasons([
        'no_stock_for_destination',
        'no_stock_for_destination',
        'margin_invalid',
      ])
    ).toMatchObject({
      no_stock_for_destination: 2,
      margin_invalid: 1,
    });
  });
});
