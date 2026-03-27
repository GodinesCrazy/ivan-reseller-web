import { assessAlibabaCapability } from '../../services/alibaba-supplier-capability.service';

describe('alibaba-supplier-capability.service', () => {
  it('fails closed when discovery signals exist but fulfillment truth is missing', () => {
    const report = assessAlibabaCapability({
      credentialState: 'missing',
      codeSignals: {
        settingsCredentialSlot: true,
        automatedBusinessSearchSignal: true,
        advancedScraperSignal: true,
        docsRoadmapSignal: true,
      },
    });

    expect(report.productionSafe).toBe(false);
    expect(report.discoveryCapability).toBe('present');
    expect(report.skuStockTruth).toBe('missing');
    expect(report.destinationShippingTruth).toBe('missing');
    expect(report.currentState).toBe('promising_but_blocked_by_credentials_env');
  });
});
