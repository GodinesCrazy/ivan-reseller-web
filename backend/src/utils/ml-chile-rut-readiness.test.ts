import { classifyMlChileRutReadiness } from './ml-chile-rut-readiness';

describe('classifyMlChileRutReadiness', () => {
  it('marks Chile RUT as likely required when checkout shape has no support', () => {
    const result = classifyMlChileRutReadiness({
      placeOrderSupportsRutNo: false,
      shippingAddressSupportsRutNo: false,
    });

    expect(result.classification).toBe('absent_but_likely_required');
  });
});
