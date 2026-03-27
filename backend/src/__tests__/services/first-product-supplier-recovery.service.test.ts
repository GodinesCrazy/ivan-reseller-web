jest.mock('../../services/supplier-target-selection.service', () => ({
  getSupplierTargetSelection: jest.fn(),
}));

import { getSupplierTargetSelection } from '../../services/supplier-target-selection.service';
import { runFirstProductRecoveryWithSupplierStrategy } from '../../services/first-product-supplier-recovery.service';

describe('first-product-supplier-recovery.service', () => {
  it('blocks recovery when the selected new supplier target is not production-safe', async () => {
    (getSupplierTargetSelection as jest.Mock).mockResolvedValue({
      primaryTarget: 'alibaba',
      backupTarget: 'none',
      rationale: 'blocked',
      executableNow: false,
      requiresLargerPlatformChange: true,
      inventory: {
        entries: [],
        summary: {
          productionUsableNow: [],
          partiallyImplemented: [],
          blockedByCredentialsOrEnv: [],
          noProductionSafeAlternativeInCodebase: true,
          strongestRunnableStrategy: 'aliexpress_hybrid_internal_fallbacks',
        },
      },
      alibabaCapability: {
        supplierTarget: 'alibaba',
        codeSignals: {
          settingsCredentialSlot: true,
          automatedBusinessSearchSignal: true,
          advancedScraperSignal: true,
          docsRoadmapSignal: true,
        },
        credentialState: 'missing',
        discoveryCapability: 'present',
        skuStockTruth: 'missing',
        destinationShippingTruth: 'missing',
        shippingCostTruth: 'missing',
        stableProductIdentity: 'partial',
        supplierAvailabilityTruth: 'partial',
        orderPlacementTruth: 'missing',
        productionSafe: false,
        blockers: ['No active Alibaba credentials were found in the real credential store.'],
        currentState: 'promising_but_blocked_by_credentials_env',
      },
    });

    const result = await runFirstProductRecoveryWithSupplierStrategy({
      userId: 1,
      maxPriceUsd: 20,
      maxSearchResults: 5,
      minSupplierSearch: 5,
      environment: 'production',
    });

    expect(result.strategy).toBe('alibaba_minimal');
    expect(result.executed).toBe(false);
    expect(result.productionSafe).toBe(false);
    if (result.strategy !== 'alibaba_minimal') {
      throw new Error('Expected alibaba_minimal blocked result');
    }
    expect(result.validated).toBe(0);
  });
});
