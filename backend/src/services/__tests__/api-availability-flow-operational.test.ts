import type { APIStatus } from '../api-availability.service';

describe('APIStatus flowOperational (integration truth)', () => {
  it('carries opportunityComparables probe for UI / capabilities', () => {
    const s: APIStatus = {
      apiName: 'mercadolibre',
      name: 'MercadoLibre API',
      isConfigured: true,
      isAvailable: true,
      lastChecked: new Date(),
      flowOperational: {
        opportunityComparables: {
          state: 'degraded',
          httpStatus: 403,
          message: 'Public catalog blocked from server IP',
          checkedAt: new Date().toISOString(),
          sampleResultCount: 0,
        },
      },
    };
    expect(s.flowOperational?.opportunityComparables?.state).toBe('degraded');
    expect(s.flowOperational?.opportunityComparables?.httpStatus).toBe(403);
  });
});
