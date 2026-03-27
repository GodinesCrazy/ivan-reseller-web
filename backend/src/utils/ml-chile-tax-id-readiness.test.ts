import { classifyMlChileTaxIdReadiness } from './ml-chile-tax-id-readiness';

describe('ML Chile tax-id readiness', () => {
  it('classifies Chile-specific fields as already modeled', () => {
    expect(
      classifyMlChileTaxIdReadiness({
        chileSpecificHitCount: 1,
        genericTaxOrCustomsHitCount: 0,
        checkoutFieldHitCount: 0,
      }),
    ).toBe('already_modeled');
  });

  it('classifies generic tax/customs handling as partially modeled', () => {
    expect(
      classifyMlChileTaxIdReadiness({
        chileSpecificHitCount: 0,
        genericTaxOrCustomsHitCount: 2,
        checkoutFieldHitCount: 1,
      }),
    ).toBe('partially_modeled');
  });

  it('classifies total absence as absent but likely required', () => {
    expect(
      classifyMlChileTaxIdReadiness({
        chileSpecificHitCount: 0,
        genericTaxOrCustomsHitCount: 0,
        checkoutFieldHitCount: 0,
      }),
    ).toBe('absent_but_likely_required');
  });
});
