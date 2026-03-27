import {
  getSupplierCapabilityInventory,
  type SupplierCapabilityInventory,
} from './supplier-capability-inventory.service';
import {
  getAlibabaSupplierCapability,
  type AlibabaSupplierCapabilityReport,
} from './alibaba-supplier-capability.service';

export interface SupplierTargetSelection {
  primaryTarget: 'alibaba' | 'none';
  backupTarget: 'none';
  rationale: string;
  executableNow: boolean;
  requiresLargerPlatformChange: boolean;
  inventory: SupplierCapabilityInventory;
  alibabaCapability: AlibabaSupplierCapabilityReport;
}

export function decideSupplierTargetSelection(params: {
  inventory: SupplierCapabilityInventory;
  alibabaCapability: AlibabaSupplierCapabilityReport;
}): SupplierTargetSelection {
  if (
    params.alibabaCapability.discoveryCapability === 'present' &&
    !params.alibabaCapability.productionSafe
  ) {
    return {
      primaryTarget: 'alibaba',
      backupTarget: 'none',
      rationale:
        'Alibaba is the strongest non-AliExpress signal in the current architecture because it already appears in settings, roadmap, automated business search, and advanced scraper code. But it is still not production-safe because SKU stock, destination shipping, shipping cost, and order-placement truth are all missing.',
      executableNow: false,
      requiresLargerPlatformChange: true,
      inventory: params.inventory,
      alibabaCapability: params.alibabaCapability,
    };
  }

  return {
    primaryTarget: 'none',
    backupTarget: 'none',
    rationale:
      'No credible non-AliExpress supplier target with sufficient architectural signals was found in the current codebase.',
    executableNow: false,
    requiresLargerPlatformChange: true,
    inventory: params.inventory,
    alibabaCapability: params.alibabaCapability,
  };
}

export async function getSupplierTargetSelection(
  userId: number
): Promise<SupplierTargetSelection> {
  const [inventory, alibabaCapability] = await Promise.all([
    getSupplierCapabilityInventory(userId),
    getAlibabaSupplierCapability(userId),
  ]);

  return decideSupplierTargetSelection({
    inventory,
    alibabaCapability,
  });
}

export default {
  decideSupplierTargetSelection,
  getSupplierTargetSelection,
};
