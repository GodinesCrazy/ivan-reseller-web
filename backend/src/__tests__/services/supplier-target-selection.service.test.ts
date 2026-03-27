import { decideSupplierTargetSelection } from '../../services/supplier-target-selection.service';
import type { SupplierCapabilityInventory } from '../../services/supplier-capability-inventory.service';
import type { AlibabaSupplierCapabilityReport } from '../../services/alibaba-supplier-capability.service';

describe('supplier-target-selection.service', () => {
  it('selects Alibaba as the strongest next target but not executable now', () => {
    const inventory: SupplierCapabilityInventory = {
      entries: [],
      summary: {
        productionUsableNow: ['AliExpress Dropshipping API validation/purchase'],
        partiallyImplemented: [],
        blockedByCredentialsOrEnv: [],
        noProductionSafeAlternativeInCodebase: true,
        strongestRunnableStrategy: 'aliexpress_hybrid_internal_fallbacks',
      },
    };

    const alibabaCapability: AlibabaSupplierCapabilityReport = {
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
    };

    const selection = decideSupplierTargetSelection({
      inventory,
      alibabaCapability,
    });

    expect(selection.primaryTarget).toBe('alibaba');
    expect(selection.executableNow).toBe(false);
    expect(selection.requiresLargerPlatformChange).toBe(true);
  });
});
