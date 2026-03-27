import { resolveListingLanguagePolicy } from '../../services/listing-language-policy.service';

describe('listing-language-policy.service', () => {
  it('supports MercadoLibre Chile in Spanish', () => {
    const result = resolveListingLanguagePolicy({
      marketplace: 'mercadolibre',
      country: 'CL',
      resolvedLanguage: 'es',
    });

    expect(result.supported).toBe(true);
    expect(result.requiredLanguage).toBe('es');
  });

  it('supports eBay US in English', () => {
    const result = resolveListingLanguagePolicy({
      marketplace: 'ebay',
      country: 'US',
      resolvedLanguage: 'en',
    });

    expect(result.supported).toBe(true);
    expect(result.requiredLanguage).toBe('en');
  });

  it('fails closed for unsupported eBay DE language policy', () => {
    const result = resolveListingLanguagePolicy({
      marketplace: 'ebay',
      country: 'DE',
      resolvedLanguage: 'de',
    });

    expect(result.supported).toBe(false);
    expect(result.reason).toContain('unsupported_language_marketplace_country');
  });
});
