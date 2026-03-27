import {
  selectSupplierStrategyForFirstValidatedProduct,
  type SupplierCapabilityInventory,
} from '../../services/supplier-capability-inventory.service';

describe('supplier-capability-inventory.service', () => {
  it('chooses new supplier integration when evidence is strong and no safe alternative exists', () => {
    const inventory: SupplierCapabilityInventory = {
      entries: [],
      summary: {
        productionUsableNow: [
          'AliExpress Affiliate API discovery',
          'AliExpress Dropshipping API validation/purchase',
        ],
        partiallyImplemented: [],
        blockedByCredentialsOrEnv: [],
        noProductionSafeAlternativeInCodebase: true,
        strongestRunnableStrategy: 'aliexpress_hybrid_internal_fallbacks',
      },
    };

    const decision = selectSupplierStrategyForFirstValidatedProduct(inventory, {
      scanned: 65,
      validated: 0,
      rejectionSummaryByCode: {
        no_stock_for_destination: 40,
        margin_invalid: 20,
        supplier_unavailable: 5,
      },
    });

    expect(decision.strategy).toBe('no_production_safe_alternative_exists_yet_in_codebase');
    expect(decision.recommendedNextMove).toBe(
      'require_new_supplier_integration_before_any_more_marketplace_work'
    );
  });

  it('keeps the current supplier strategy when evidence is not yet conclusive', () => {
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

    const decision = selectSupplierStrategyForFirstValidatedProduct(inventory, {
      scanned: 10,
      validated: 0,
      rejectionSummaryByCode: {
        no_stock_for_destination: 3,
        margin_invalid: 5,
      },
    });

    expect(decision.strategy).toBe('combine_aliexpress_with_existing_fallback_ranking');
    expect(decision.recommendedNextMove).toBe('continue_ebay_with_new_supplier_strategy');
  });
});
