import { resolveDestinationStrict } from '../../services/destination.service';

describe('destination.service strict mapping', () => {
  it('resolves eBay ES to ES/EUR without USD fallback', () => {
    const destination = resolveDestinationStrict('ebay', { marketplace_id: 'EBAY_ES' });
    expect(destination.countryCode).toBe('ES');
    expect(destination.currency).toBe('EUR');
    expect(destination.resolved).toBe(true);
  });

  it('resolves eBay GB to GB/GBP using ISO country code', () => {
    const destination = resolveDestinationStrict('ebay', { marketplace_id: 'EBAY_GB' });
    expect(destination.countryCode).toBe('GB');
    expect(destination.currency).toBe('GBP');
    expect(destination.resolved).toBe(true);
  });

  it('fails closed when eBay marketplace is unknown', () => {
    const destination = resolveDestinationStrict('ebay', { marketplace_id: 'EBAY_UNKNOWN' });
    expect(destination.resolved).toBe(false);
    expect(destination.currency).toBe('');
    expect(destination.resolutionError).toContain('unmapped');
  });

  it('resolves MercadoLibre Chile to CL/CLP', () => {
    const destination = resolveDestinationStrict('mercadolibre', { siteId: 'MLC' });
    expect(destination.countryCode).toBe('CL');
    expect(destination.currency).toBe('CLP');
    expect(destination.language).toBe('es');
  });
});
